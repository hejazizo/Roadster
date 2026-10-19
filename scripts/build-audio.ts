// Builds the car's drivetrain loops, public/audio/drivetrain/*.mp3, and their manifest
// src/audio/drivetrainSamples.ts, from CC0 recordings of real EVs on Freesound (sources and
// licences in assets/audio/LICENSE.txt). The raw recordings aren't in the repo: they're
// downloaded into assets/audio/cache/ (git-ignored) on the first run.
//
// Each layer is a stretch of one recording, mixed to mono and filtered. A stretch where the
// car speeds up has its pitch flattened: the motor's tone is tracked along a guide drawn from
// its spectrogram and the stretch resampled so the tone holds still, then the speed it's held
// at becomes the layer's reference speed. The loop's tail is crossfaded into its head, and the
// file wraps a little of each end around the loop, so an MP3 decoder's start delay (which
// browsers trim differently) moves both loop points onto matching audio.
//
// Needs ffmpeg on PATH. Run with `npm run audio:build` (or `make audio`, which installs it in
// a throwaway container). AUDIO_DEBUG=<dir> also writes each loop played three times, and its
// spectrogram, to that directory.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SR = 44100
const CACHE_DIR = 'assets/audio/cache'
const OUTPUT_DIR = 'public/audio/drivetrain'
const MANIFEST = 'src/audio/drivetrainSamples.ts'
const BITRATE = '96k'
const BUDGET = 500_000 // bytes for every loop together
const PAD = 0.1 // s of each loop end wrapped around it in the file
const DEBUG_DIR = process.env.AUDIO_DEBUG

type Source = {
  url: string
  // How to mix it to mono: the BMW i3 recording is mid-side, so its first channel alone.
  pan: string
}

const SOURCES = {
  // "electric car - bmw i3 - driving - M+S 48k24b.WAV" by tferrino, CC0.
  i3: {
    url: 'https://cdn.freesound.org/previews/405/405285_7891112-hq.mp3',
    pan: 'pan=mono|c0=c0',
  },
  // "Acceleration of an electric car" (Tesla Model S Plaid, full throttle) by justVova, CC0.
  plaid: {
    url: 'https://cdn.freesound.org/previews/761/761685_13088347-hq.mp3',
    pan: 'pan=mono|c0=0.5*c0+0.5*c1',
  },
} satisfies Record<string, Source>

// The Plaid's strongest motor tone, read off its spectrogram: [s, Hz] along the launch. The
// tone is about 64 Hz per m/s of road speed (it rises 830 Hz/s at launch, about 1.3 g).
const PLAID_TONE: [number, number][] = [
  [0.3, 450],
  [1.2, 1200],
  [2.4, 1900],
  [4.1, 2574],
  [4.4, 2650],
]
const PLAID_HZ_PER_MS = 64

type Layer = {
  source: keyof typeof SOURCES
  start: number // s into the recording
  end: number
  // Flatten the pitch along this tone, Hz per m/s of road speed; the reference speed comes out.
  track?: { guide: [number, number][]; hzPerMs: number }
  refSpeed?: number // m/s the stretch was recorded at, when it isn't tracked
  highpass?: number // Hz
  lowpass?: number // Hz
  crossfade: number // s, loop tail into head
}

// Layer ids are the names src/audio/drivetrain.ts plays them by.
const LAYERS: Record<string, Layer> = {
  // On load: the Plaid's launch, cut into three speed bands. All are tracked along the same
  // tone, so their pitches line up across a band change.
  onLow: {
    source: 'plaid',
    start: 0.35,
    end: 1.15,
    track: { guide: PLAID_TONE, hzPerMs: PLAID_HZ_PER_MS },
    highpass: 250,
    crossfade: 0.12,
  },
  // Starts after a knock in the recording at 1.47 s.
  onMid: {
    source: 'plaid',
    start: 1.55,
    end: 2.38,
    track: { guide: PLAID_TONE, hzPerMs: PLAID_HZ_PER_MS },
    highpass: 250,
    crossfade: 0.15,
  },
  onHigh: {
    source: 'plaid',
    start: 2.4,
    end: 4.35,
    track: { guide: PLAID_TONE, hzPerMs: PLAID_HZ_PER_MS },
    highpass: 250,
    crossfade: 0.2,
  },
  // Off load: the i3 cruising at a steady speed. Its motor tone runs from about 1010 Hz at the
  // start to 1590 Hz, over 60 to 100 km/h, so about 59 Hz per m/s; it holds at 1155 Hz here.
  offMid: { source: 'i3', start: 14, end: 16.5, refSpeed: 19.6, highpass: 250, crossfade: 0.25 },
  // And at 1585 Hz here.
  offHigh: { source: 'i3', start: 82.5, end: 85.5, refSpeed: 27, highpass: 250, crossfade: 0.3 },
  // Road and tyre noise: the i3's cabin at speed, below the motor.
  rumble: { source: 'i3', start: 86, end: 89, refSpeed: 27, lowpass: 350, crossfade: 0.3 },
  // Boost's power surge: the Plaid's top end, its whine without the body.
  surge: {
    source: 'plaid',
    start: 2.4,
    end: 4.35,
    track: { guide: PLAID_TONE, hzPerMs: PLAID_HZ_PER_MS },
    highpass: 900,
    crossfade: 0.2,
  },
}

// Every loop is normalised to this RMS level (dBFS); their balance is set in TUNING.audio.
const TARGET_RMS = -20
const PEAK_LIMIT = -1

const dbToGain = (db: number) => 10 ** (db / 20)
const gainToDb = (g: number) => 20 * Math.log10(g)

async function cached(id: string, { url }: Source) {
  mkdirSync(CACHE_DIR, { recursive: true })
  const path = join(CACHE_DIR, `${id}.mp3`)
  if (!existsSync(path)) {
    console.log(`Downloading ${url}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  }
  return path
}

// Decodes a stretch of a file to mono float samples at SR, through an ffmpeg filter chain.
function decode(path: string, filters: string[], start = 0, duration?: number) {
  const args = ['-v', 'error', '-ss', String(start)]
  if (duration !== undefined) args.push('-t', String(duration))
  args.push('-i', path, '-af', filters.join(','), '-ar', String(SR), '-f', 'f32le', '-')
  const raw = execFileSync('ffmpeg', args, { maxBuffer: 1 << 30 })
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length))
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const step = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(step * k)
        const s = Math.sin(step * k)
        const a = i + k
        const b = a + len / 2
        const vr = re[b] * c - im[b] * s
        const vi = re[b] * s + im[b] * c
        re[b] = re[a] - vr
        im[b] = im[a] - vi
        re[a] += vr
        im[a] += vi
      }
    }
  }
}

const lerpGuide = (guide: [number, number][], t: number) => {
  let i = 0
  while (i < guide.length - 2 && t > guide[i + 1][0]) i++
  const [t0, f0] = guide[i]
  const [t1, f1] = guide[i + 1]
  return f0 + ((f1 - f0) * (t - t0)) / (t1 - t0)
}

// Least-squares quadratic through weighted points; returns its coefficients [c0, c1, c2].
function fitQuadratic(points: { t: number; f: number; w: number }[]) {
  const m = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  for (const { t, f, w } of points) {
    const p = [1, t, t * t]
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) m[r][c] += w * p[r] * p[c]
      m[r][3] += w * p[r] * f
    }
  }
  for (let col = 0; col < 3; col++) {
    for (let r = col + 1; r < 3; r++) {
      const k = m[r][col] / m[col][col]
      for (let c = col; c < 4; c++) m[r][c] -= k * m[col][c]
    }
  }
  const x = [0, 0, 0]
  for (let r = 2; r >= 0; r--) {
    let s = m[r][3]
    for (let c = r + 1; c < 3; c++) s -= m[r][c] * x[c]
    x[r] = s / m[r][r]
  }
  return x
}

// Follows the tone near the guide through `x` (which starts at `t0` s) and returns a smooth
// curve of its frequency over time.
function trackTone(x: Float32Array, t0: number, guide: [number, number][]) {
  const N = 4096
  const hop = Math.round(0.02 * SR)
  const width = 0.1 // search ± this fraction around the guide
  const points: { t: number; f: number; w: number }[] = []
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  for (let p = 0; p + N <= x.length; p += hop) {
    const t = t0 + (p + N / 2) / SR
    re.fill(0)
    im.fill(0)
    for (let i = 0; i < N; i++) re[i] = x[p + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
    fft(re, im)
    const mag = (k: number) => 20 * Math.log10(Math.hypot(re[k], im[k]) + 1e-12)
    const g = lerpGuide(guide, t)
    const lo = Math.floor((g * (1 - width) * N) / SR)
    const hi = Math.ceil((g * (1 + width) * N) / SR)
    let best = lo
    for (let k = lo; k <= hi; k++) if (mag(k) > mag(best)) best = k
    // Prominence over the median level around the search band.
    const around: number[] = []
    for (let k = lo - 30; k <= hi + 30; k++) around.push(mag(k))
    around.sort((a, b) => a - b)
    const prominence = mag(best) - around[around.length >> 1]
    if (prominence < 8 || best <= lo || best >= hi) continue
    const [a, b, c] = [mag(best - 1), mag(best), mag(best + 1)]
    const shift = (a - c) / (2 * (a - 2 * b + c))
    points.push({ t, f: ((best + shift) * SR) / N, w: prominence })
  }
  // Fit, drop points more than 4 % off the fit, fit again.
  let coef = fitQuadratic(points)
  const at = (t: number) => coef[0] + coef[1] * t + coef[2] * t * t
  const kept = points.filter((p) => Math.abs(p.f / at(p.t) - 1) < 0.04)
  coef = fitQuadratic(kept)
  const err = Math.sqrt(kept.reduce((s, p) => s + (p.f / at(p.t) - 1) ** 2, 0) / kept.length)
  return { at, kept: kept.length, total: points.length, err }
}

// 4-point Hermite interpolation of x at fractional index p.
function sampleAt(x: Float32Array, p: number) {
  const i = Math.floor(p)
  const f = p - i
  const xm = x[Math.max(i - 1, 0)]
  const x0 = x[i]
  const x1 = x[Math.min(i + 1, x.length - 1)]
  const x2 = x[Math.min(i + 2, x.length - 1)]
  const c1 = 0.5 * (x1 - xm)
  const c2 = xm - 2.5 * x0 + 2 * x1 - 0.5 * x2
  const c3 = 0.5 * (x2 - xm) + 1.5 * (x0 - x1)
  return ((c3 * f + c2) * f + c1) * f + x0
}

// Resamples x (starting at t0 s) so the tracked tone holds at fRef: each output sample moves
// fRef / f(t) input samples on, from `from` to `to` s.
function flatten(
  x: Float32Array,
  t0: number,
  from: number,
  to: number,
  f: (t: number) => number,
  fRef: number,
) {
  const out: number[] = []
  let p = (from - t0) * SR
  const end = (to - t0) * SR
  while (p < end && p < x.length - 2) {
    out.push(sampleAt(x, p))
    p += fRef / f(t0 + p / SR)
  }
  return Float32Array.from(out)
}

// Crossfades the last `fade` samples into the first ones (equal power), so the result loops.
function makeLoop(x: Float32Array, fade: number) {
  const length = x.length - fade
  const y = x.slice(0, length)
  for (let i = 0; i < fade; i++) {
    const a = ((i + 0.5) / fade) * (Math.PI / 2)
    y[i] = x[i] * Math.sin(a) + x[length + i] * Math.cos(a)
  }
  return y
}

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

function writeWav(path: string, x: Float32Array) {
  const data = Buffer.alloc(x.length * 4)
  x.forEach((v, i) => data.writeFloatLE(v, i * 4))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(3, 20) // IEEE float
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SR, 24)
  header.writeUInt32LE(SR * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(32, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([header, data]))
}

// How far the decoded file jumps at its loop point, against its typical sample-to-sample step
// (1 is a seamless loop; a click would be many times that).
function seamJump(path: string, loopStart: number, loopEnd: number) {
  const y = decode(path, ['anull'])
  const s = Math.round(loopStart * SR)
  const e = Math.round(loopEnd * SR)
  const steps: number[] = []
  for (let i = s + 1; i < e; i++) steps.push(Math.abs(y[i] - y[i - 1]))
  steps.sort((a, b) => a - b)
  const typical = steps[Math.floor(steps.length * 0.9)]
  return Math.abs(y[s] - y[e - 1]) / typical
}

const toKebab = (id: string) => id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

rmSync(OUTPUT_DIR, { recursive: true, force: true })
mkdirSync(OUTPUT_DIR, { recursive: true })
if (DEBUG_DIR) mkdirSync(DEBUG_DIR, { recursive: true })

const paths: Record<string, string> = {}
for (const [id, source] of Object.entries(SOURCES)) paths[id] = await cached(id, source)

const manifest: Record<
  string,
  { file: string; loopStart: number; loopEnd: number; refSpeed: number }
> = {}
for (const [id, layer] of Object.entries(LAYERS)) {
  const source = SOURCES[layer.source]
  const filters = [source.pan]
  if (layer.highpass) filters.push(`highpass=f=${layer.highpass}:poles=2`)
  if (layer.lowpass) filters.push(`lowpass=f=${layer.lowpass}:poles=2`)
  // Decode a margin either side, for the tracker's window and the resampler.
  const margin = 0.25
  const t0 = Math.max(0, layer.start - margin)
  const x = decode(paths[layer.source], filters, t0, layer.end - t0 + margin)

  let stretch: Float32Array
  let refSpeed: number
  let note = ''
  if (layer.track) {
    const tone = trackTone(x, t0, layer.track.guide)
    const fRef = tone.at((layer.start + layer.end) / 2)
    stretch = flatten(x, t0, layer.start, layer.end, tone.at, fRef)
    refSpeed = fRef / layer.track.hzPerMs
    note = `tone ${Math.round(tone.at(layer.start))}→${Math.round(tone.at(layer.end))} Hz held at ${Math.round(fRef)} Hz, ${tone.kept}/${tone.total} frames, ${(tone.err * 100).toFixed(1)} % off the fit`
  } else {
    const s = Math.round((layer.start - t0) * SR)
    stretch = x.slice(s, s + Math.round((layer.end - layer.start) * SR))
    refSpeed = layer.refSpeed ?? 1
  }

  const loop = makeLoop(stretch, Math.round(layer.crossfade * SR))
  const gain = Math.min(dbToGain(TARGET_RMS) / rms(loop), dbToGain(PEAK_LIMIT) / peak(loop))
  for (let i = 0; i < loop.length; i++) loop[i] *= gain

  const pad = Math.round(PAD * SR)
  const file = new Float32Array(loop.length + 2 * pad)
  file.set(loop.subarray(loop.length - pad), 0)
  file.set(loop, pad)
  file.set(loop.subarray(0, pad), pad + loop.length)

  const name = `${toKebab(id)}.mp3`
  const wav = join(OUTPUT_DIR, `${id}.wav`)
  const mp3 = join(OUTPUT_DIR, name)
  writeWav(wav, file)
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    wav,
    '-c:a',
    'libmp3lame',
    '-b:a',
    BITRATE,
    mp3,
  ])
  rmSync(wav)

  const loopStart = pad / SR
  const loopEnd = (pad + loop.length) / SR
  manifest[id] = {
    file: name,
    loopStart: Number(loopStart.toFixed(6)),
    loopEnd: Number(loopEnd.toFixed(6)),
    refSpeed: Number(refSpeed.toFixed(2)),
  }
  const seam = seamJump(mp3, loopStart, loopEnd)
  console.log(
    `${id.padEnd(8)} ${(loop.length / SR).toFixed(2)} s  ${(statSync(mp3).size / 1000).toFixed(1)} kB  ref ${refSpeed.toFixed(1)} m/s  gain ${gainToDb(gain).toFixed(1)} dB  seam ×${seam.toFixed(2)}  ${note}`,
  )

  if (DEBUG_DIR) {
    const thrice = new Float32Array(loop.length * 3)
    for (let k = 0; k < 3; k++) thrice.set(loop, k * loop.length)
    const debugWav = join(DEBUG_DIR, `${id}.wav`)
    writeWav(debugWav, thrice)
    execFileSync('ffmpeg', [
      ...['-v', 'error', '-y', '-i', debugWav, '-lavfi'],
      'showspectrumpic=s=1200x500:legend=1:scale=log:color=intensity:drange=80',
      join(DEBUG_DIR, `${id}.png`),
    ])
  }
}

const total = readdirSync(OUTPUT_DIR).reduce((s, f) => s + statSync(join(OUTPUT_DIR, f)).size, 0)
console.log(`Total ${(total / 1000).toFixed(1)} kB`)
if (total > BUDGET) throw new Error(`Over the ${BUDGET / 1000} kB budget`)

writeFileSync(
  MANIFEST,
  `// Generated by scripts/build-audio.ts; don't edit. The drivetrain's loops in
// public/audio/drivetrain/: loop points (s, inside the file) and the road speed (m/s) each was
// recorded at, which plays it at its own pitch.
export const DRIVETRAIN_SAMPLES = ${JSON.stringify(manifest, null, 2)} as const

export type DrivetrainLayer = keyof typeof DRIVETRAIN_SAMPLES
`,
)
execFileSync('npx', ['prettier', '--write', MANIFEST], { stdio: 'ignore' })
console.log(`Wrote ${MANIFEST}`)
