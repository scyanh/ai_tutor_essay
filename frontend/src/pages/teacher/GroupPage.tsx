import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, BookOpen, Calendar, ClipboardCheck, Pencil, Users } from 'lucide-react'
import { api } from '../../api'
import { useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import { dueInfo, shortTitle } from '../../lib/format'
import { Avatar, Button, Card, cn, ErrorState, PageLoader } from '../../components/ui'
import { Breadcrumbs, GroupFormModal, JoinCodeCard } from '../../components/teacher'

export default function GroupPage() {
  const { groupId } = useParams()
  const token = useToken()
  const { data, error, loading, reload, setData } = useAsync(
    () => api.getGroupOverview(token, Number(groupId)),
    [token, groupId],
  )
  const [renaming, setRenaming] = useState(false)

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const { group, students, assignments } = data
  const active = assignments.filter((a) => dueInfo(a.due_date).tone !== 'overdue')
  const base = `/maestro/grupos/${group.id}`

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs items={[{ label: 'Mis grupos', to: '/maestro' }, { label: group.name }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600">Grupo</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{group.name}</h1>
          <p className="mt-1 text-slate-500">
            {group.student_count} {group.student_count === 1 ? 'alumno' : 'alumnos'} · {group.assignment_count}{' '}
            {group.assignment_count === 1 ? 'tarea' : 'tareas'}
          </p>
        </div>
        <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setRenaming(true)}>
          Editar nombre
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <SectionCard
            to={`${base}/alumnos`}
            icon={<Users className="size-6" />}
            tone="brand"
            title="Alumnos"
            count={group.student_count}
            caption={group.student_count === 1 ? 'alumno inscrito' : 'alumnos inscritos'}
            cta="Ver alumnos"
          >
            {students.length === 0 ? (
              <p className="text-sm text-slate-400">Comparte la clave para que se unan.</p>
            ) : (
              <ul className="space-y-2.5">
                {students.slice(0, 4).map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5">
                    <Avatar name={s.name} id={s.id} size="sm" />
                    <span className="truncate text-sm text-slate-700">{s.name}</span>
                  </li>
                ))}
                {students.length > 4 && <li className="pl-10 text-xs text-slate-400">y {students.length - 4} más</li>}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            to={`${base}/tareas`}
            icon={<BookOpen className="size-6" />}
            tone="sky"
            title="Tareas"
            count={group.assignment_count}
            caption={`${active.length} ${active.length === 1 ? 'activa' : 'activas'}`}
            cta="Ver tareas"
            badge={
              group.pending_count > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200 ring-inset">
                  <ClipboardCheck className="size-3.5" />
                  {group.pending_count} por calificar
                </span>
              ) : undefined
            }
          >
            {assignments.length === 0 ? (
              <p className="text-sm text-slate-400">Aún no hay tareas en este grupo.</p>
            ) : (
              <ul className="space-y-2.5">
                {assignments.slice(0, 3).map((a) => {
                  const due = dueInfo(a.due_date)
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-slate-700">{shortTitle(a.title)}</span>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 text-xs',
                          due.tone === 'soon' ? 'text-amber-600' : 'text-slate-400',
                        )}
                      >
                        <Calendar className="size-3" />
                        {due.label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        <JoinCodeCard group={group} onRegenerated={(g) => setData({ ...data, group: g })} />
      </div>

      <GroupFormModal
        open={renaming}
        group={group}
        onClose={() => setRenaming(false)}
        onSaved={(g) => {
          setData({ ...data, group: g })
          setRenaming(false)
        }}
      />
    </div>
  )
}

const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  sky: 'bg-sky-50 text-sky-600',
}

function SectionCard({
  to,
  icon,
  tone,
  title,
  count,
  caption,
  cta,
  badge,
  children,
}: {
  to: string
  icon: ReactNode
  tone: keyof typeof TONES
  title: string
  count: number
  caption: string
  cta: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <Link to={to} className="group block min-w-0">
      <Card className="flex h-full flex-col p-6 transition group-hover:-translate-y-0.5 group-hover:shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <span className={cn('grid size-12 place-items-center rounded-2xl', TONES[tone])}>{icon}</span>
          {badge}
        </div>
        <h2 className="mt-5 text-lg font-semibold text-slate-900">{title}</h2>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">{count}</span>
          <span className="text-sm text-slate-500">{caption}</span>
        </div>
        <div className="mt-5 flex-1 border-t border-slate-100 pt-5">{children}</div>
        <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600">
          {cta}
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
        </div>
      </Card>
    </Link>
  )
}
