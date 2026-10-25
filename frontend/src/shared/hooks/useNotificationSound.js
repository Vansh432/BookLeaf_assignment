import { useEffect, useSyncExternalStore } from 'react'
import {
  isSoundEnabled,
  setSoundEnabled,
  subscribeToSoundSetting,
  unlockNotificationSound,
} from '../services/notificationSound.js'

const UNLOCK_EVENTS = ['pointerdown', 'keydown']

// The shared on/off setting, plus a one-time audio unlock on the user's first click or key press.
const useNotificationSound = () => {
  const enabled = useSyncExternalStore(subscribeToSoundSetting, isSoundEnabled)

  useEffect(() => {
    const unlock = () => {
      unlockNotificationSound()
      UNLOCK_EVENTS.forEach((event) => window.removeEventListener(event, unlock))
    }
    UNLOCK_EVENTS.forEach((event) => window.addEventListener(event, unlock))
    return () => UNLOCK_EVENTS.forEach((event) => window.removeEventListener(event, unlock))
  }, [])

  return { enabled, setEnabled: setSoundEnabled }
}

export default useNotificationSound
