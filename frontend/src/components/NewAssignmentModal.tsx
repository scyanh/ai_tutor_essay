import { useState, type FormEvent } from 'react'
import { api, type Assignment, type Group } from '../api'
import { useToken } from '../auth/AuthContext'
import { Button, Field, inputClass, Modal } from './ui'

function defaultDue(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  d.setHours(23, 59, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function NewAssignmentModal({
  open,
  group,
  onClose,
  onCreated,
}: {
  open: boolean
  group: Group
  onClose: () => void
  onCreated: (a: Assignment) => void
}) {
  const token = useToken()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rubric, setRubric] = useState('')
  const [due, setDue] = useState(defaultDue)
  const [minWords, setMinWords] = useState(600)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setTitle('')
    setDescription('')
    setRubric('')
    setDue(defaultDue())
    setMinWords(600)
    setError(null)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const created = await api.createAssignment(token, {
        group_id: group.id,
        title,
        description,
        rubric,
        due_date: due ? new Date(due).toISOString() : null,
        min_words: minWords,
      })
      reset()
      onCreated(created)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Nueva tarea de ensayo"
      description={`La tarea quedará asignada a todos los alumnos de ${group.name}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-assignment" loading={saving}>
            Publicar tarea
          </Button>
        </>
      }
    >
      <form id="new-assignment" onSubmit={onSubmit} className="space-y-5">
        <Field label="Título">
          <input
            required
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ensayo argumentativo: …"
          />
        </Field>
        <Field label="Instrucciones" hint="Explica qué deben argumentar, qué lecturas usar y la extensión esperada.">
          <textarea
            required
            rows={4}
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Rúbrica" hint="Un criterio por línea. Sharon la usará para orientar a tus alumnos.">
          <textarea
            rows={4}
            className={inputClass}
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
            placeholder={'1. Tesis (20%)\n2. Uso de evidencia (30%)'}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Fecha límite">
            <input type="datetime-local" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Extensión mínima (palabras)">
            <input
              type="number"
              min={50}
              step={50}
              required
              className={inputClass}
              value={minWords}
              onChange={(e) => setMinWords(Number(e.target.value))}
            />
          </Field>
        </div>
        {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  )
}
