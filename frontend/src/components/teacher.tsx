import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Copy, KeyRound, RefreshCw } from 'lucide-react'
import { api, type Group, type GroupSummary } from '../api'
import { useToken } from '../auth/AuthContext'
import { Button, Card, cn, Field, inputClass, Modal } from './ui'

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-sm">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 text-slate-300" />}
          {item.to ? (
            <Link to={item.to} className="text-slate-500 transition hover:text-slate-900">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-900">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

const STAT_TONES = {
  brand: 'bg-brand-50 text-brand-600',
  sky: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  hint?: string
  tone: keyof typeof STAT_TONES
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={cn('grid size-9 place-items-center rounded-xl', STAT_TONES[tone])}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </Card>
  )
}

export function JoinCodeCard({ group, onRegenerated }: { group: Group; onRegenerated: (g: GroupSummary) => void }) {
  const token = useToken()
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(group.join_code)
      setCopied(true)
    } catch {
      setError('No se pudo copiar. Selecciona la clave y cópiala manualmente.')
    }
  }

  const regenerate = async () => {
    setRegenerating(true)
    setError(null)
    try {
      onRegenerated(await api.regenerateJoinCode(token, group.id))
      setConfirming(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <Card className="relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-brand-100/60 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-sm font-medium text-brand-700">
          <KeyRound className="size-4" />
          Clave del grupo
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Compártela con tus alumnos: la escriben en su cuenta, en «Unirme a un grupo».
        </p>
        <div
          className="mt-5 select-all rounded-2xl border border-dashed border-brand-200 bg-brand-50/60 px-4 py-5 text-center font-mono text-3xl font-semibold tracking-[0.2em] text-brand-900 sm:text-4xl"
          aria-label={`Clave ${group.join_code.split('').join(' ')}`}
        >
          {group.join_code}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} className="flex-1">
            {copied ? 'Copiada' : 'Copiar clave'}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(true)} icon={<RefreshCw className="size-4" />}>
            Generar nueva
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="¿Generar una clave nueva?"
        description="La clave actual dejará de funcionar. Los alumnos que ya están en el grupo no se ven afectados."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={regenerating}>
              Cancelar
            </Button>
            <Button onClick={regenerate} loading={regenerating}>
              Generar clave
            </Button>
          </>
        }
      />
    </Card>
  )
}

export function GroupFormModal({
  open,
  group,
  onClose,
  onSaved,
}: {
  open: boolean
  group?: Group | null
  onClose: () => void
  onSaved: (g: GroupSummary) => void
}) {
  const token = useToken()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(group?.name ?? '')
      setError(null)
    }
  }, [open, group])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onSaved(group ? await api.renameGroup(token, group.id, name) : await api.createGroup(token, name))
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
      title={group ? 'Editar grupo' : 'Nuevo grupo'}
      description={group ? undefined : 'Se generará una clave para que tus alumnos se unan.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="group-form" loading={saving} disabled={!name.trim()}>
            {group ? 'Guardar cambios' : 'Crear grupo'}
          </Button>
        </>
      }
    >
      <form id="group-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Nombre del grupo" hint="Por ejemplo, la materia y el grado: «Historia Universal · 5°A».">
          <input
            autoFocus
            required
            maxLength={128}
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Historia Universal · 5°A"
          />
        </Field>
        {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  )
}
