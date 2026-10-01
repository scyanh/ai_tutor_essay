import { useCallback, useEffect, useState } from 'react'
import { Download, FileText, X } from 'lucide-react'
import { api, type AssignmentDocument } from '../api'
import { useToken } from '../auth/AuthContext'
import { Spinner } from './ui'

interface ViewerState {
  doc: AssignmentDocument
  url: string | null
  error: string | null
}

/** Visor de PDF en un modal: no depende de ventanas emergentes y no saca al alumno del editor. */
export function useDocumentViewer() {
  const token = useToken()
  const [state, setState] = useState<ViewerState | null>(null)

  const close = useCallback(() => {
    setState((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return null
    })
  }, [])

  const open = useCallback(
    async (doc: AssignmentDocument) => {
      setState({ doc, url: null, error: null })
      try {
        const blob = await api.getDocumentFile(token, doc.id)
        const url = URL.createObjectURL(blob)
        setState((current) => (current?.doc.id === doc.id ? { ...current, url } : (URL.revokeObjectURL(url), current)))
      } catch (err) {
        setState((current) => (current?.doc.id === doc.id ? { ...current, error: (err as Error).message } : current))
      }
    },
    [token],
  )

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, close])

  const viewer = state && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={state.doc.file_name}
        className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-lift animate-pop"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <FileText className="size-4 shrink-0 text-rose-500" />
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
            {state.doc.file_name.replace(/_/g, ' ')}
          </div>
          {state.url && (
            <a
              href={state.url}
              download={state.doc.file_name}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <Download className="size-4" /> Descargar
            </a>
          )}
          <button
            onClick={close}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="relative flex-1 bg-slate-100">
          {state.error ? (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-rose-600">{state.error}</div>
          ) : state.url ? (
            <iframe src={state.url} title={state.doc.file_name} className="h-full w-full" />
          ) : (
            <div className="grid h-full place-items-center">
              <Spinner className="size-7" />
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return { open, viewer }
}
