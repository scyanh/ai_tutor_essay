import { useState } from 'react'
import { CircleCheck, ListChecks, Pencil } from 'lucide-react'
import { api } from '../api'
import { useToken } from '../auth/AuthContext'
import { Button, cn, inputClass } from './ui'

export default function RubricEditor({ assignmentId, initial }: { assignmentId: number; initial: string | null }) {
  const token = useToken()
  const [rubric, setRubric] = useState(initial ?? '')
  const [draft, setDraft] = useState(rubric)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateAssignment(token, assignmentId, { rubric: draft })
      setRubric(updated.rubric ?? '')
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ListChecks className="size-4 text-brand-600" /> Rúbrica
        </h3>
        {!editing && (
          <button
            onClick={() => {
              setDraft(rubric)
              setEditing(true)
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <Pencil className="size-3" /> {rubric ? 'Editar' : 'Agregar'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(6, draft.split('\n').length + 1)}
            autoFocus
            className={cn(inputClass, 'text-sm leading-relaxed')}
            placeholder={'1. Tesis (20%): …\n2. Uso de evidencia (30%): …'}
          />
          <p className="mt-1 text-xs text-slate-500">
            Un criterio por línea. Tus alumnos y Sharon verán la rúbrica actualizada de inmediato.
          </p>
          {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void save()} loading={saving}>
              Guardar rúbrica
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : rubric ? (
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-600">{rubric}</p>
      ) : (
        <p className="mt-2 text-sm text-slate-400">Esta tarea aún no tiene rúbrica.</p>
      )}
      {saved && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 animate-fade-in">
          <CircleCheck className="size-3.5" /> Rúbrica guardada
        </p>
      )}
    </div>
  )
}
