import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  { enabled, delay = 1200 }: { enabled: boolean; delay?: number },
) {
  const [state, setState] = useState<SaveState>('idle')
  const latest = useRef(value)
  const saved = useRef(JSON.stringify(value))
  const inFlight = useRef<Promise<void> | null>(null)
  const saveRef = useRef(save)
  latest.current = value
  saveRef.current = save

  const flush = useCallback(async () => {
    while (inFlight.current) await inFlight.current
    const snapshot = JSON.stringify(latest.current)
    if (snapshot === saved.current) return
    setState('saving')
    const run = saveRef
      .current(latest.current)
      .then(() => {
        saved.current = snapshot
        setState(JSON.stringify(latest.current) === snapshot ? 'saved' : 'dirty')
      })
      .catch(() => setState('error'))
      .finally(() => {
        inFlight.current = null
      })
    inFlight.current = run
    await run
  }, [])

  const markSaved = useCallback((v: T) => {
    saved.current = JSON.stringify(v)
    setState('idle')
  }, [])

  useEffect(() => {
    if (!enabled || JSON.stringify(value) === saved.current) return
    setState((s) => (s === 'saving' ? s : 'dirty'))
    const t = setTimeout(flush, delay)
    return () => clearTimeout(t)
  }, [value, enabled, delay, flush])

  useEffect(() => {
    if (!enabled) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== saved.current) {
        void flush()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      void flush()
    }
  }, [enabled, flush])

  return { state, flush, markSaved }
}
