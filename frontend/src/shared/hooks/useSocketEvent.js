import { useEffect, useRef } from 'react'
import socket from '../services/socket.js'

// Subscribes to a socket event for the component's lifetime; the latest handler is always used.
const useSocketEvent = (event, handler) => {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    const listener = (payload) => handlerRef.current(payload)
    socket.on(event, listener)
    return () => {
      socket.off(event, listener)
    }
  }, [event])
}

export default useSocketEvent
