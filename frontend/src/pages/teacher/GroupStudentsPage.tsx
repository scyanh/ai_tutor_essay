import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRightLeft, FileText, Search, UserMinus, Users } from 'lucide-react'
import { api, type Essay, type GroupSummary, type User } from '../../api'
import { useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import { essayFor } from '../../lib/format'
import {
  Avatar,
  Button,
  buttonClass,
  Card,
  cn,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  GradePill,
  inputClass,
  MenuButton,
  Modal,
  PageLoader,
} from '../../components/ui'
import { Breadcrumbs } from '../../components/teacher'

export default function GroupStudentsPage() {
  const { groupId } = useParams()
  const token = useToken()
  const { data, error, loading, reload } = useAsync(() => api.getGroupOverview(token, Number(groupId)), [token, groupId])
  const [query, setQuery] = useState('')
  const [moving, setMoving] = useState<User | null>(null)
  const [removing, setRemoving] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!data) return []
    return data.students.map((student) => {
      const essays = data.assignments
        .map((a) => essayFor(data.essays, a.id, student.id))
        .filter((e): e is Essay => e != null && e.status !== 'draft')
      const graded = essays.filter((e) => e.grade != null)
      const avg = graded.length ? graded.reduce((s, e) => s + (e.grade ?? 0), 0) / graded.length : null
      return { student, delivered: essays.length, pending: essays.length - graded.length, avg }
    })
  }, [data])

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const { group } = data
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? rows.filter((r) => r.student.name.toLowerCase().includes(needle) || r.student.email.toLowerCase().includes(needle))
    : rows

  const confirmRemove = async () => {
    if (!removing) return
    setBusy(true)
    setActionError(null)
    try {
      await api.removeStudent(token, group.id, removing.id)
      setRemoving(null)
      reload()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs
        items={[
          { label: 'Mis grupos', to: '/maestro' },
          { label: group.name, to: `/maestro/grupos/${group.id}` },
          { label: 'Alumnos' },
        ]}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Alumnos</h1>
          <p className="mt-1 text-slate-500">
            {group.student_count} {group.student_count === 1 ? 'alumno' : 'alumnos'} en {group.name}
          </p>
        </div>
        {data.students.length > 0 && (
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className={cn(inputClass, 'pl-10')}
              placeholder="Buscar por nombre o correo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        {data.students.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="Aún no hay alumnos"
            description={`Comparte la clave ${group.join_code} para que se unan desde su cuenta.`}
            action={
              <Link to={`/maestro/grupos/${group.id}`} className={buttonClass('secondary')}>
                Ver clave del grupo
              </Link>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Search className="size-6" />} title="Sin resultados" description="Ningún alumno coincide con tu búsqueda." />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <th className="px-6 py-3 font-medium">Alumno</th>
                  <th className="px-4 py-3 font-medium">Entregas</th>
                  <th className="px-4 py-3 font-medium">Promedio</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(({ student, delivered, pending, avg }) => (
                  <tr key={student.id} className="transition hover:bg-slate-50/60">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={student.name} id={student.id} size="sm" />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">{student.name}</div>
                          <div className="truncate text-xs text-slate-500">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      <span className="font-semibold text-slate-900 tabular-nums">{delivered}</span>
                      <span className="text-slate-400">/{data.assignments.length}</span>
                      {pending > 0 && (
                        <span className="ml-2 rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700">
                          {pending} por calificar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {avg != null ? <GradePill grade={avg} /> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/maestro/grupos/${group.id}/alumnos/${student.id}`}
                          className={buttonClass('secondary', 'sm')}
                        >
                          <FileText className="size-3.5" />
                          Ver entregas
                        </Link>
                        <MenuButton
                          label={`Opciones de ${student.name}`}
                          items={[
                            {
                              label: 'Mover a otro grupo',
                              icon: <ArrowRightLeft className="size-4" />,
                              onSelect: () => setMoving(student),
                            },
                            {
                              label: 'Quitar del grupo',
                              icon: <UserMinus className="size-4" />,
                              danger: true,
                              onSelect: () => {
                                setActionError(null)
                                setRemoving(student)
                              },
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <MoveStudentModal
        student={moving}
        group={group}
        onClose={() => setMoving(null)}
        onMoved={() => {
          setMoving(null)
          reload()
        }}
      />

      <ConfirmDialog
        open={removing != null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        loading={busy}
        error={actionError}
        title={`¿Quitar a ${removing?.name ?? ''} del grupo?`}
        description="Dejará de ver las tareas de este grupo. Su cuenta y sus entregas anteriores se conservan, y puede volver a unirse con la clave."
        confirmLabel="Quitar del grupo"
      />
    </div>
  )
}

function MoveStudentModal({
  student,
  group,
  onClose,
  onMoved,
}: {
  student: User | null
  group: GroupSummary
  onClose: () => void
  onMoved: () => void
}) {
  const token = useToken()
  const groups = useAsync(() => (student ? api.listGroups(token) : Promise.resolve([])), [token, student])
  const [target, setTarget] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = (groups.data ?? []).filter((g) => g.id !== group.id)

  const close = () => {
    setTarget(null)
    setError(null)
    onClose()
  }

  const submit = async () => {
    if (!student || target == null) return
    setSaving(true)
    setError(null)
    try {
      await api.moveStudent(token, group.id, student.id, target)
      setTarget(null)
      onMoved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={student != null}
      onClose={close}
      title="Mover a otro grupo"
      description={student ? `Elige el nuevo grupo de ${student.name}.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving} disabled={target == null}>
            Mover alumno
          </Button>
        </>
      }
    >
      {groups.loading ? (
        <div className="py-6 text-center text-sm text-slate-400">Cargando grupos…</div>
      ) : options.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No tienes otros grupos. Crea uno desde «Mis grupos» para poder mover alumnos.
        </p>
      ) : (
        <div className="space-y-2">
          {options.map((g) => (
            <label
              key={g.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition',
                target === g.id ? 'border-brand-300 bg-brand-50/60 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <input
                type="radio"
                name="target-group"
                className="size-4 accent-brand-600"
                checked={target === g.id}
                onChange={() => setTarget(g.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{g.name}</div>
                <div className="text-xs text-slate-500">
                  {g.student_count} alumnos · {g.assignment_count} tareas
                </div>
              </div>
            </label>
          ))}
          <p className="pt-2 text-xs text-slate-500">
            Las entregas que ya hizo en este grupo se conservan y siguen visibles en cada tarea.
          </p>
        </div>
      )}
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p>}
    </Modal>
  )
}
