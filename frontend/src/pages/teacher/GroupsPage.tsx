import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ClipboardCheck, KeyRound, Pencil, Plus, Trash2, Users, UsersRound } from 'lucide-react'
import { api, type GroupSummary } from '../../api'
import { useAuth, useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import { firstName, greeting } from '../../lib/format'
import { Avatar, Button, Card, ConfirmDialog, EmptyState, ErrorState, MenuButton, PageLoader } from '../../components/ui'
import { GroupFormModal } from '../../components/teacher'

export default function GroupsPage() {
  const token = useToken()
  const { user } = useAuth()
  const { data, error, loading, reload, setData } = useAsync(() => api.listGroups(token), [token])
  const [editing, setEditing] = useState<GroupSummary | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<GroupSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data || !user) return null

  const totals = data.reduce(
    (acc, g) => ({ students: acc.students + g.student_count, pending: acc.pending + g.pending_count }),
    { students: 0, pending: 0 },
  )

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await api.deleteGroup(token, deleting.id)
      setData(data.filter((g) => g.id !== deleting.id))
      setDeleting(null)
    } catch (err) {
      setDeleteError((err as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600">Mis grupos</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {greeting()}, {firstName(user.name)}
          </h1>
          <p className="mt-1 text-slate-500">
            {data.length === 0
              ? 'Crea tu primer grupo para empezar a invitar alumnos.'
              : `${data.length} ${data.length === 1 ? 'grupo' : 'grupos'} · ${totals.students} alumnos${
                  totals.pending ? ` · ${totals.pending} ${totals.pending === 1 ? 'ensayo' : 'ensayos'} por calificar` : ''
                }`}
          </p>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Nuevo grupo
        </Button>
      </div>

      {data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersRound className="size-6" />}
            title="Aún no tienes grupos"
            description="Cada grupo tiene una clave que tus alumnos escriben para unirse. Ahí mismo asignas tareas."
            action={<Button onClick={() => setCreating(true)}>Crear grupo</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onEdit={() => setEditing(group)}
              onDelete={() => {
                setDeleteError(null)
                setDeleting(group)
              }}
            />
          ))}
          <button
            onClick={() => setCreating(true)}
            className="flex min-h-[15rem] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600"
          >
            <span className="grid size-11 place-items-center rounded-2xl bg-white shadow-soft">
              <Plus className="size-5" />
            </span>
            <span className="text-sm font-medium">Crear otro grupo</span>
          </button>
        </div>
      )}

      <GroupFormModal
        open={creating || editing != null}
        group={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={(saved) => {
          setData(editing ? data.map((g) => (g.id === saved.id ? saved : g)) : [...data, saved])
          setCreating(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        error={deleteError}
        title={`¿Eliminar «${deleting?.name ?? ''}»?`}
        confirmLabel="Eliminar grupo"
      >
        <p className="text-sm text-slate-600">Esta acción no se puede deshacer. Se eliminarán también:</p>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li className="flex items-center gap-2">
            <BookOpen className="size-4 text-slate-400" />
            {deleting?.assignment_count ?? 0} tareas con sus lecturas, entregas y calificaciones
          </li>
          <li className="flex items-center gap-2">
            <Users className="size-4 text-slate-400" />
            La inscripción de {deleting?.student_count ?? 0} alumnos (sus cuentas se conservan)
          </li>
        </ul>
      </ConfirmDialog>
    </div>
  )
}

function GroupCard({ group, onEdit, onDelete }: { group: GroupSummary; onEdit: () => void; onDelete: () => void }) {
  const extra = group.student_count - group.students_preview.length
  return (
    <div className="group relative">
      <Card className="pointer-events-none flex h-full min-h-[15rem] flex-col p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lift">
        <Link
          to={`/maestro/grupos/${group.id}`}
          aria-label={`Abrir ${group.name}`}
          className="pointer-events-auto absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/20">
            <UsersRound className="size-5" />
          </div>
          <div className="pointer-events-auto">
            <MenuButton
              label={`Opciones de ${group.name}`}
              items={[
                { label: 'Editar nombre', icon: <Pencil className="size-4" />, onSelect: onEdit },
                { label: 'Eliminar grupo', icon: <Trash2 className="size-4" />, onSelect: onDelete, danger: true },
              ]}
            />
          </div>
        </div>
        <h3 className="relative mt-4 line-clamp-2 text-lg font-semibold leading-snug text-slate-900">{group.name}</h3>
        <div className="relative mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-slate-500">
          <KeyRound className="size-3.5" />
          {group.join_code}
        </div>

        <div className="relative mt-auto flex items-end justify-between gap-3 pt-6">
          <div className="flex items-center">
            {group.students_preview.length === 0 ? (
              <span className="text-sm text-slate-400">Sin alumnos todavía</span>
            ) : (
              <div className="flex -space-x-2">
                {group.students_preview.map((s) => (
                  <div key={s.id} className="rounded-full ring-2 ring-white">
                    <Avatar name={s.name} id={s.id} size="sm" />
                  </div>
                ))}
                {extra > 0 && (
                  <div className="grid size-8 place-items-center rounded-full bg-slate-100 text-xs font-medium text-slate-600 ring-2 ring-white">
                    +{extra}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1" title="Alumnos">
              <Users className="size-3.5" />
              {group.student_count}
            </span>
            <span className="inline-flex items-center gap-1" title="Tareas">
              <BookOpen className="size-3.5" />
              {group.assignment_count}
            </span>
            {group.pending_count > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-sky-700" title="Por calificar">
                <ClipboardCheck className="size-3.5" />
                {group.pending_count}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
