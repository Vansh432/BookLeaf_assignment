import { useSyncExternalStore } from 'react'
import socket from '../services/socket.js'

const subscribe = (onChange) => {
  socket.on('connect', onChange)
  socket.on('disconnect', onChange)
  return () => {
    socket.off('connect', onChange)
    socket.off('disconnect', onChange)
  }
}

const getIsConnected = () => socket.connected

const useSocketStatus = () => useSyncExternalStore(subscribe, getIsConnected)

export default useSocketStatus
