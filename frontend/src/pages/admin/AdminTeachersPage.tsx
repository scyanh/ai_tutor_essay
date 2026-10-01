import { useEffect, useState, type FormEvent } from 'react'
import { BookOpen, GraduationCap, Pencil, Search, Trash2, UserPlus, Users, UsersRound } from 'lucide-react'
import { api, type AdminTeacher } from '../../api'
import { useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import { formatDate } from '../../lib/format'
import {
  Avatar,
  Button,
  Card,
  cn,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  MenuButton,
  Modal,
  PageLoader,
} from '../../components/ui'
import { StatCard } from '../../components/teacher'

export default function AdminTeachersPage() {
  const token = useToken()
  const { data, error, loading, reload, setData } = useAsync(() => api.listTeachers(token), [token])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AdminTeacher | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<AdminTeacher | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const needle = query.trim().toLowerCase()
  const visible = needle
    ? data.filter((t) => t.name.toLowerCase().includes(needle) || t.email.toLowerCase().includes(needle))
    : data
  const totals = data.reduce(
    (acc, t) => ({ groups: acc.groups + t.group_count, students: acc.students + t.student_count }),
    { groups: 0, students: 0 },
  )

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await api.deleteTeacher(token, deleting.id)
      setData(data.filter((t) => t.id !== deleting.id))
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
          <p className="text-sm font-medium text-brand-600">Administración</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Maestros</h1>
          <p className="mt-1 text-slate-500">Da de alta, edita o elimina las cuentas de los maestros de la plataforma.</p>
        </div>
        <Button icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
          Nuevo maestro
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<GraduationCap className="size-5" />} label="Maestros" value={data.length} tone="brand" />
        <StatCard icon={<UsersRound className="size-5" />} label="Grupos" value={totals.groups} tone="sky" />
        <StatCard
          icon={<Users className="size-5" />}
          label="Alumnos inscritos"
          value={totals.students}
          hint="Suma por maestro"
          tone="emerald"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-slate-900">Todos los maestros</h2>
          {data.length > 0 && (
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
        {data.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="size-6" />}
            title="Aún no hay maestros"
            description="Crea la primera cuenta de maestro para que pueda formar sus grupos."
            action={<Button onClick={() => setCreating(true)}>Nuevo maestro</Button>}
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Search className="size-6" />} title="Sin resultados" description="Ningún maestro coincide con tu búsqueda." />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <th className="px-6 py-3 font-medium">Maestro</th>
                  <th className="px-4 py-3 font-medium">Grupos</th>
                  <th className="px-4 py-3 font-medium">Alumnos</th>
                  <th className="px-4 py-3 font-medium">Tareas</th>
                  <th className="px-4 py-3 font-medium">Alta</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((t) => (
                  <tr key={t.id} className="transition hover:bg-slate-50/60">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.name} id={t.id} size="sm" />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">{t.name}</div>
                          <div className="truncate text-xs text-slate-500">{t.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 tabular-nums">{t.group_count}</td>
                    <td className="px-4 py-3.5 text-slate-700 tabular-nums">{t.student_count}</td>
                    <td className="px-4 py-3.5 text-slate-700 tabular-nums">{t.assignment_count}</td>
                    <td className="px-4 py-3.5 text-slate-500">{t.created_at ? formatDate(t.created_at) : '—'}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex justify-end">
                        <MenuButton
                          label={`Opciones de ${t.name}`}
                          items={[
                            { label: 'Editar', icon: <Pencil className="size-4" />, onSelect: () => setEditing(t) },
                            {
                              label: 'Eliminar',
                              icon: <Trash2 className="size-4" />,
                              danger: true,
                              onSelect: () => {
                                setDeleteError(null)
                                setDeleting(t)
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

      <TeacherFormModal
        open={creating || editing != null}
        teacher={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={(saved) => {
          const next = editing ? data.map((t) => (t.id === saved.id ? saved : t)) : [...data, saved]
          setData(next.sort((a, b) => a.name.localeCompare(b.name, 'es')))
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
        title={`¿Eliminar a ${deleting?.name ?? ''}?`}
        confirmLabel="Eliminar maestro"
      >
        <p className="text-sm text-slate-600">
          Esta acción no se puede deshacer. Se eliminarán su cuenta y todo su trabajo en la plataforma:
        </p>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li className="flex items-center gap-2">
            <UsersRound className="size-4 text-slate-400" />
            {deleting?.group_count ?? 0} grupos
          </li>
          <li className="flex items-center gap-2">
            <BookOpen className="size-4 text-slate-400" />
            {deleting?.assignment_count ?? 0} tareas con sus lecturas, entregas y calificaciones
          </li>
          <li className="flex items-center gap-2">
            <Users className="size-4 text-slate-400" />
            Los alumnos conservan sus cuentas, pero dejan de estar en esos grupos
          </li>
        </ul>
      </ConfirmDialog>
    </div>
  )
}

function TeacherFormModal({
  open,
  teacher,
  onClose,
  onSaved,
}: {
  open: boolean
  teacher: AdminTeacher | null
  onClose: () => void
  onSaved: (t: AdminTeacher) => void
}) {
  const token = useToken()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(teacher?.name ?? '')
    setEmail(teacher?.email ?? '')
    setPassword('')
    setError(null)
  }, [open, teacher])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onSaved(
        teacher
          ? await api.updateTeacher(token, teacher.id, { name, email, ...(password ? { password } : {}) })
          : await api.createTeacher(token, { name, email, password }),
      )
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
      title={teacher ? 'Editar maestro' : 'Nuevo maestro'}
      description={teacher ? undefined : 'El maestro entrará con este correo y contraseña, y podrá crear sus grupos.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="teacher-form" loading={saving}>
            {teacher ? 'Guardar cambios' : 'Crear maestro'}
          </Button>
        </>
      }
    >
      <form id="teacher-form" onSubmit={onSubmit} className="space-y-5">
        <Field label="Nombre">
          <input
            autoFocus
            required
            minLength={2}
            maxLength={128}
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prof. Nombre Apellido"
          />
        </Field>
        <Field label="Correo">
          <input
            type="email"
            required
            maxLength={128}
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maestro@escuela.edu.mx"
          />
        </Field>
        <Field
          label={teacher ? 'Nueva contraseña' : 'Contraseña'}
          hint={teacher ? 'Déjala vacía para conservar la actual.' : 'Mínimo 4 caracteres. Compártela con el maestro.'}
        >
          <input
            type="text"
            autoComplete="new-password"
            required={!teacher}
            minLength={4}
            maxLength={128}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  )
}
