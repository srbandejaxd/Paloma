import { useState, useEffect, useRef, useCallback } from 'react'

export function useTimer(running: boolean) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number>()

  const tick = useCallback(() => {
    if (startRef.current !== null) {
      setElapsed(Date.now() - startRef.current)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (running) {
      if (startRef.current === null) {
        startRef.current = Date.now()
      }
      rafRef.current = requestAnimationFrame(tick)
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [running, tick])

  function reset() {
    startRef.current = null
    setElapsed(0)
  }

  function getElapsed() {
    return startRef.current !== null ? Date.now() - startRef.current : elapsed
  }

  return { elapsed, reset, getElapsed }
}
