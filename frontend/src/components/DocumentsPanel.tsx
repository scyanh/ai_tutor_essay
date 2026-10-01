import { useEffect, useRef, useState, type DragEvent } from 'react'
import { CircleAlert, CircleCheck, FileText, LoaderCircle, Paperclip, Trash2, Upload } from 'lucide-react'
import { api, type AssignmentDocument, type IndexStatus } from '../api'
import { useToken } from '../auth/AuthContext'
import { formatSize } from '../lib/documents'
import { useDocumentViewer } from './DocumentViewer'
import { Button, cn } from './ui'

const STATUS: Record<IndexStatus, { label: string; className: string; icon: typeof CircleCheck }> = {
  indexed: { label: 'Lista para Sharon', className: 'text-emerald-600', icon: CircleCheck },
  indexing: { label: 'Indexando…', className: 'text-amber-600', icon: LoaderCircle },
  error: { label: 'No se pudo indexar', className: 'text-rose-600', icon: CircleAlert },
  local: { label: 'Sin indexar', className: 'text-slate-400', icon: FileText },
}

const POLL_MS = 15_000

export default function DocumentsPanel({
  assignmentId,
  initial,
}: {
  assignmentId: number
  initial: AssignmentDocument[]
}) {
  const token = useToken()
  const [docs, setDocs] = useState(initial)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { open: openDocument, viewer } = useDocumentViewer()

  const pending = docs.some((d) => d.index_status === 'indexing')
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => {
      api.listDocuments(token, assignmentId).then(setDocs).catch(() => {})
    }, POLL_MS)
    return () => clearInterval(t)
  }, [pending, token, assignmentId])

  const upload = async (files: File[]) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length !== files.length) setError('Solo se pueden subir archivos PDF.')
    if (!pdfs.length) return
    setUploading(true)
    setError(null)
    try {
      const added = await api.uploadDocuments(token, assignmentId, pdfs)
      setDocs((current) => [...current.filter((d) => !added.some((a) => a.id === d.id)), ...added])
    } catch (err) {
      setError((err as Error).message)
      // Los archivos anteriores al que falló sí quedaron guardados
      api.listDocuments(token, assignmentId).then(setDocs).catch(() => {})
    } finally {
      setUploading(false)
    }
  }

  const remove = async (doc: AssignmentDocument) => {
    if (!window.confirm(`¿Quitar «${doc.file_name}» de la tarea? Sharon dejará de usarla.`)) return
    try {
      await api.deleteDocument(token, doc.id)
      setDocs((current) => current.filter((d) => d.id !== doc.id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void upload(Array.from(e.dataTransfer.files))
  }

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Paperclip className="size-4 text-brand-600" /> Lecturas de referencia
      </h3>
      <p className="mt-1 text-xs text-slate-500">Sharon busca en estas lecturas para guiar a tus alumnos.</p>

      {docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {docs.map((d) => {
            const status = STATUS[d.index_status]
            return (
              <li key={d.id} className="group flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <FileText className="mt-0.5 size-4 shrink-0 text-rose-500" />
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => d.has_file && void openDocument(d)}
                    disabled={!d.has_file}
                    className={cn(
                      'block max-w-full truncate text-left text-sm font-medium text-slate-800',
                      d.has_file && 'hover:text-brand-600 hover:underline',
                    )}
                    title={d.has_file ? 'Abrir PDF' : 'Sin archivo disponible'}
                  >
                    {d.file_name.replace(/_/g, ' ')}
                  </button>
                  {d.summary && <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{d.summary}</div>}
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={cn('inline-flex items-center gap-1 font-medium', status.className)}>
                      <status.icon className={cn('size-3', d.index_status === 'indexing' && 'animate-spin')} />
                      {status.label}
                    </span>
                    {d.size_bytes ? <span className="text-slate-400">· {formatSize(d.size_bytes)}</span> : null}
                  </div>
                </div>
                <button
                  onClick={() => void remove(d)}
                  className="rounded-lg p-1.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus:opacity-100"
                  aria-label={`Quitar ${d.file_name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'mt-3 flex flex-col items-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition',
          dragging ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200',
        )}
      >
        <Upload className="size-5 text-slate-400" />
        <p className="mt-1.5 text-sm text-slate-600">Arrastra PDFs aquí o</p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Subiendo…' : 'Elegir archivos'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <p className="mt-2 text-[11px] text-slate-400">Hasta 20 MB por archivo. La indexación tarda unos minutos.</p>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {viewer}
    </div>
  )
}
