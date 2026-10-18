import { useEffect } from 'react'
import { onPress, onUserGesture } from '../input/input'
import { useAudioStore } from '../state/audioStore'
import { isRunning, useRaceStore, type RaceState } from '../state/raceStore'
import { setAudioPaused, startAudio } from './audio'
import { setMusicIntensity, startMusic } from './music'
import { sfx } from './sounds'

// Sounds for race events: countdown beeps, rings, reveal-run steps and penalties, finish. Pause muffles the music and
// silences the car; a run gets the full music.
function onRaceChange(s: RaceState, prev: RaceState) {
  if (s.paused !== prev.paused) setAudioPaused(s.paused)
  if (isRunning(s.phase) !== isRunning(prev.phase)) {
    setMusicIntensity(isRunning(s.phase) ? 'full' : 'calm')
  }

  if (s.phase === 'countdown') {
    const restarted = s.runId !== prev.runId
    if (restarted || Math.ceil(s.countdown) < Math.ceil(prev.countdown)) sfx.countdown()
  } else if (s.phase === 'racing' && prev.phase === 'countdown') {
    sfx.go()
  }

  if (s.phase === 'finished' && prev.phase !== 'finished') sfx.finish(s.newBest)
  else if (s.phase === 'racing' && s.nextRing > prev.nextRing) sfx.ring(prev.nextRing)
  else if (s.phase === 'racing' && s.stuntSteps > prev.stuntSteps) sfx.stunt(prev.stunt.step)
  if (s.phase === 'racing' && s.stuntFails > prev.stuntFails) sfx.stuntFail()
}

// The first click or key press starts audio and the music, matched to the game's state;
// later ones resume a context the browser suspended.
function start() {
  const first = !useAudioStore.getState().started
  if (!startAudio() || !first) return
  const race = useRaceStore.getState()
  setAudioPaused(race.paused)
  setMusicIntensity(isRunning(race.phase) ? 'full' : 'calm')
  startMusic()
}

// Mount once, in App.
export function useGameAudio() {
  useEffect(() => {
    const offGesture = onUserGesture(start)
    const offPress = onPress((action) => {
      if (action === 'mute') useAudioStore.getState().toggleMute()
    })
    const offRace = useRaceStore.subscribe(onRaceChange)
    return () => {
      offGesture()
      offPress()
      offRace()
    }
  }, [])
}
