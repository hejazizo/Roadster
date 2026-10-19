import { useEffect, useRef, useState } from 'react'

// Motion helpers for the overlay. Anything that moves has a still version under
// `prefers-reduced-motion` (the CSS side is in theme.css).

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const easeOut = (t: number) => 1 - (1 - t) ** 3

// A number that counts towards `target` over `ms` (ease-out), starting `delay` ms after the
// target changes and from wherever it was (`from` on the first run). Jumps straight to the
// target under reduced motion.
export function useCountUp(target: number, ms: number, { from = 0, delay = 0 } = {}) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : from))
  const shown = useRef(value)
  useEffect(() => {
    const start = performance.now() + (prefersReducedMotion() ? 0 : delay)
    const duration = prefersReducedMotion() ? 0 : ms
    const origin = shown.current
    let frame = requestAnimationFrame(function tick(now) {
      const t = duration > 0 ? Math.min(Math.max((now - start) / duration, 0), 1) : 1
      shown.current = origin + (target - origin) * easeOut(t)
      setValue(shown.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, ms, delay])
  return value
}
