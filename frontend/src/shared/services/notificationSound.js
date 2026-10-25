// A short two-note chime generated with the Web Audio API, so the app ships no audio file.
const STORAGE_KEY = 'bl_notification_sound'
const NOTES = [
  { frequency: 880, startsAt: 0 },
  { frequency: 1320, startsAt: 0.12 },
]
const NOTE_SECONDS = 0.18
const VOLUME = 0.12
// Several notifications arriving together play one chime, not a burst.
const MIN_GAP_MS = 1000

let audioContext = null
let lastPlayedAt = 0
const listeners = new Set()

// Browser storage can be unavailable (private mode, blocked site data); sound then simply defaults to on.
const readEnabled = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

let enabled = readEnabled()

export const isSoundEnabled = () => enabled

export const setSoundEnabled = (value) => {
  enabled = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off')
  } catch {
    // The choice still applies for this session.
  }
  listeners.forEach((listener) => listener())
}

export const subscribeToSoundSetting = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getAudioContext = () => {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
  if (!AudioContextClass) {
    return null
  }
  audioContext ??= new AudioContextClass()
  return audioContext
}

// Browsers only allow audio after the user has interacted with the page. Call this from a click or key
// press so that a notification arriving later (e.g. after a page reload) is not silent.
export const unlockNotificationSound = () => {
  const context = getAudioContext()
  if (context?.state === 'suspended') {
    context.resume().catch(() => {})
  }
}

export const playNotificationSound = () => {
  const now = Date.now()
  if (!enabled || now - lastPlayedAt < MIN_GAP_MS) {
    return
  }

  const context = getAudioContext()
  if (!context) {
    return
  }
  lastPlayedAt = now
  context.resume().catch(() => {})

  for (const note of NOTES) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = context.currentTime + note.startsAt

    oscillator.type = 'sine'
    oscillator.frequency.value = note.frequency
    // Quick fade in and out, so the tones do not click.
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(VOLUME, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_SECONDS)

    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + NOTE_SECONDS)
  }
}
