import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, Calendar, ClipboardCheck, FileText, Inbox, Plus, TrendingUp, Users } from 'lucide-react'
import { api, type Assignment, type Essay, type User } from '../../api'
import { useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import {
  dueInfo,
  essayProgress,
  essayFor,
  essayStatus,
  essayTypeLabel,
  formatRelative,
  shortTitle,
  STATUS_LABEL,
  type ProgressStatus,
} from '../../lib/format'
import {
  Avatar,
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  ErrorState,
  GradePill,
  PageLoader,
  ProgressBar,
} from '../../components/ui'
import { Breadcrumbs, SectionHeader, StatCard } from '../../components/teacher'
import NewAssignmentModal from '../../components/NewAssignmentModal'

interface GroupWork {
  students: User[]
  assignments: Assignment[]
  essays: Essay[]
}

const DAY = 24 * 60 * 60 * 1000
const PERIODS = [
  { key: 'todas', label: 'Todas', days: null },
  { key: '7d', label: 'Últimos 7 días', days: 7 },
  { key: '30d', label: 'Últimos 30 días', days: 30 },
  { key: '6m', label: 'Últimos 6 meses', days: 183 },
] as const
type PeriodKey = (typeof PERIODS)[number]['key']

export default function GroupAssignmentsPage() {
  const { groupId } = useParams()
  const token = useToken()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data, error, loading, reload } = useAsync(() => api.getGroupOverview(token, Number(groupId)), [token, groupId])
  const [creating, setCreating] = useState(false)

  const period = PERIODS.find((p) => p.key === params.get('periodo')) ?? PERIODS[0]
  const setPeriod = (key: PeriodKey) => {
    const next = new URLSearchParams(params)
    if (key === 'todas') next.delete('periodo')
    else next.set('periodo', key)
    setParams(next, { replace: true })
  }

  const work = useMemo<GroupWork | null>(() => {
    if (!data) return null
    const since = period.days ? Date.now() - period.days * DAY : null
    const assignments = since
      ? data.assignments.filter((a) => new Date(a.created_at).getTime() >= since)
      : data.assignments
    const ids = new Set(assignments.map((a) => a.id))
    return { students: data.students, assignments, essays: data.essays.filter((e) => ids.has(e.assignment_id)) }
  }, [data, period.days])

  const stats = useMemo(() => {
    if (!work) return null
    const studentIds = new Set(work.students.map((s) => s.id))
    const mine = work.essays.filter((e) => studentIds.has(e.student_id))
    const toGrade = mine.filter((e) => e.status === 'submitted')
    const graded = mine.filter((e) => e.status === 'graded' && e.grade != null)
    const avg = graded.length ? graded.reduce((s, e) => s + (e.grade ?? 0), 0) / graded.length : null
    const active = work.assignments.filter((a) => !a.due_date || new Date(a.due_date).getTime() > Date.now())
    return { toGrade, avg, active, gradedCount: graded.length }
  }, [work])

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data || !work || !stats) return null

  const { group } = data
  const queue = [...stats.toGrade].sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
  const hiddenCount = data.assignments.length - work.assignments.length

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Mis grupos', to: '/maestro' },
            { label: group.name, to: `/maestro/grupos/${group.id}` },
            { label: 'Tareas' },
          ]}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tareas</h1>
            <p className="mt-1 text-slate-500">
              {stats.toGrade.length > 0
                ? `Tienes ${stats.toGrade.length} ${stats.toGrade.length === 1 ? 'ensayo esperando' : 'ensayos esperando'} tu calificación.`
                : 'Estás al día con las calificaciones.'}
            </p>
          </div>
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nueva tarea
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Periodo" className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period.key === p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                period.key === p.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          {period.days
            ? `${work.assignments.length} ${work.assignments.length === 1 ? 'publicada' : 'publicadas'} en este periodo${
                hiddenCount ? ` · ${hiddenCount} ${hiddenCount === 1 ? 'anterior oculta' : 'anteriores ocultas'}` : ''
              }`
            : `${work.assignments.length} ${work.assignments.length === 1 ? 'tarea' : 'tareas'} en total`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Users className="size-5" />} label="Alumnos" value={work.students.length} tone="brand" />
        <StatCard
          icon={<BookOpen className="size-5" />}
          label="Tareas activas"
          value={stats.active.length}
          hint={period.days ? `${work.assignments.length} en el periodo` : `${work.assignments.length} en total`}
          tone="sky"
        />
        <StatCard
          icon={<ClipboardCheck className="size-5" />}
          label="Por calificar"
          value={stats.toGrade.length}
          hint={`${stats.gradedCount} calificados`}
          tone="amber"
        />
        <StatCard
          icon={<TrendingUp className="size-5" />}
          label="Promedio del grupo"
          value={stats.avg != null ? stats.avg.toFixed(1) : '—'}
          hint="Escala de 0 a 10"
          tone="emerald"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="min-w-0">
          <SectionHeader title="Tareas de ensayo" subtitle="Avance del grupo en cada tarea" />
          {work.assignments.length === 0 ? (
            <Card>
              {data.assignments.length === 0 ? (
                <EmptyState
                  icon={<FileText className="size-6" />}
                  title="Aún no has creado tareas"
                  description="Crea la primera tarea de ensayo para este grupo."
                  action={<Button onClick={() => setCreating(true)}>Crear tarea</Button>}
                />
              ) : (
                <EmptyState
                  icon={<Calendar className="size-6" />}
                  title="Sin tareas en este periodo"
                  description="No publicaste tareas en este rango de fechas."
                  action={
                    <Button variant="secondary" onClick={() => setPeriod('todas')}>
                      Ver todas
                    </Button>
                  }
                />
              )}
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {work.assignments.map((a) => (
                <AssignmentCard key={a.id} assignment={a} overview={work} />
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <SectionHeader title="Por calificar" subtitle="Más antiguos primero" />
          <Card className="overflow-hidden">
            {queue.length === 0 ? (
              <EmptyState icon={<Inbox className="size-6" />} title="Bandeja vacía" description="No hay ensayos pendientes." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {queue.map((essay) => {
                  const student = work.students.find((s) => s.id === essay.student_id)
                  const assignment = work.assignments.find((a) => a.id === essay.assignment_id)
                  if (!student || !assignment) return null
                  return (
                    <li key={essay.id}>
                      <Link
                        to={`/maestro/tareas/${assignment.id}/alumnos/${student.id}`}
                        className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50"
                      >
                        <Avatar name={student.name} id={student.id} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-900">{student.name}</div>
                          <div className="truncate text-xs text-slate-500">{shortTitle(assignment.title)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-400">{essay.submitted_at && formatRelative(essay.submitted_at)}</div>
                          <div className="mt-0.5 text-xs font-medium text-brand-600 opacity-0 transition group-hover:opacity-100">
                            Calificar →
                          </div>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {work.assignments.length > 0 && (
        <section>
          <SectionHeader title="Alumnos y ensayos" subtitle="Estado de cada alumno en cada tarea. Haz clic en una celda para ver el ensayo." />
          <StudentMatrix overview={work} onOpen={(aId, sId) => navigate(`/maestro/tareas/${aId}/alumnos/${sId}`)} />
        </section>
      )}

      <NewAssignmentModal
        open={creating}
        group={group}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          setPeriod('todas')
          reload()
        }}
      />
    </div>
  )
}

const SEGMENT_COLORS: Record<ProgressStatus, string> = {
  graded: 'bg-emerald-500',
  submitted: 'bg-sky-500',
  draft: 'bg-amber-400',
  not_started: 'bg-slate-200',
}

function AssignmentCard({ assignment, overview }: { assignment: Assignment; overview: GroupWork }) {
  const due = dueInfo(assignment.due_date)
  const counts: Record<ProgressStatus, number> = { graded: 0, submitted: 0, draft: 0, not_started: 0 }
  let progressSum = 0
  for (const s of overview.students) {
    const essay = essayFor(overview.essays, assignment.id, s.id)
    counts[essayStatus(essay)]++
    progressSum += essayProgress(essay, assignment)
  }
  const total = overview.students.length || 1
  const delivered = counts.graded + counts.submitted
  const avgProgress = Math.round(progressSum / total)

  return (
    <Link to={`/maestro/tareas/${assignment.id}`} className="group block">
      <Card className="flex h-full flex-col p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <Badge tone="brand">{essayTypeLabel(assignment.title)}</Badge>
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              due.tone === 'overdue' ? 'text-slate-400' : due.tone === 'soon' ? 'text-amber-600' : 'text-slate-500',
            )}
          >
            <Calendar className="size-3.5" />
            {due.label}
          </span>
        </div>
        <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-slate-900">{shortTitle(assignment.title)}</h3>

        <div className="mt-auto pt-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-slate-500">
              <span className="font-semibold text-slate-900 tabular-nums">{delivered}</span>/{overview.students.length}{' '}
              entregados
            </span>
            <span className="text-xs text-slate-400">Avance promedio {avgProgress}%</span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
            {(['graded', 'submitted', 'draft', 'not_started'] as const).map((k) =>
              counts[k] ? (
                <div
                  key={k}
                  className={SEGMENT_COLORS[k]}
                  style={{ width: `${(counts[k] / total) * 100}%` }}
                  title={`${STATUS_LABEL[k]}: ${counts[k]}`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            {(['graded', 'submitted', 'draft', 'not_started'] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={cn('size-2 rounded-full', SEGMENT_COLORS[k])} />
                {STATUS_LABEL[k]} {counts[k]}
              </span>
            ))}
          </div>
        </div>
      </Card>
    </Link>
  )
}

function StudentMatrix({
  overview,
  onOpen,
}: {
  overview: GroupWork
  onOpen: (assignmentId: number, studentId: number) => void
}) {
  const { students, assignments } = overview
  if (students.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Users className="size-6" />} title="Sin alumnos" description="Aún no hay alumnos en este grupo." />
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <th className="sticky left-0 z-10 bg-slate-50/95 px-5 py-3 font-medium">Alumno</th>
              {assignments.map((a) => (
                <th key={a.id} className="px-4 py-3 font-medium">
                  <Link
                    to={`/maestro/tareas/${a.id}`}
                    className="line-clamp-1 max-w-[14rem] normal-case tracking-normal text-slate-600 hover:text-brand-600"
                    title={a.title}
                  >
                    {shortTitle(a.title)}
                  </Link>
                </th>
              ))}
              <th className="px-5 py-3 text-right font-medium">Promedio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s) => {
              const grades = assignments
                .map((a) => essayFor(overview.essays, a.id, s.id))
                .filter((e): e is Essay => e?.status === 'graded' && e.grade != null)
              const avg = grades.length ? grades.reduce((acc, e) => acc + (e.grade ?? 0), 0) / grades.length : null
              return (
                <tr key={s.id} className="transition hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} id={s.id} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">{s.name}</div>
                        <div className="truncate text-xs text-slate-500">{s.email}</div>
                      </div>
                    </div>
                  </td>
                  {assignments.map((a) => (
                    <td key={a.id} className="px-4 py-2">
                      <MatrixCell essay={essayFor(overview.essays, a.id, s.id)} assignment={a} onClick={() => onOpen(a.id, s.id)} />
                    </td>
                  ))}
                  <td className="px-5 py-3 text-right">
                    {avg != null ? <GradePill grade={avg} /> : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function MatrixCell({ essay, assignment, onClick }: { essay: Essay | null; assignment: Assignment; onClick: () => void }) {
  const status = essayStatus(essay)
  const progress = essayProgress(essay, assignment)
  const overdue = assignment.due_date && new Date(assignment.due_date).getTime() < Date.now()

  return (
    <button
      onClick={onClick}
      className="group flex w-full min-w-[8.5rem] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white hover:ring-1 hover:ring-slate-200"
    >
      {status === 'graded' && essay?.grade != null ? (
        <>
          <GradePill grade={essay.grade} />
          <span className="text-xs text-slate-500">Calificado</span>
        </>
      ) : status === 'submitted' ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
          <ClipboardCheck className="size-3.5" />
          Por calificar
        </span>
      ) : status === 'draft' ? (
        <div className="w-full">
          <div className="flex justify-between text-xs">
            <span className={overdue ? 'text-rose-600' : 'text-amber-700'}>{overdue ? 'Atrasado' : 'En progreso'}</span>
            <span className="text-slate-400 tabular-nums">{progress}%</span>
          </div>
          <ProgressBar value={progress} className="mt-1" />
        </div>
      ) : (
        <span className={cn('text-xs', overdue ? 'text-rose-500' : 'text-slate-400')}>
          {overdue ? 'No entregó' : 'Sin iniciar'}
        </span>
      )}
      <ArrowRight className="ml-auto size-3.5 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />
    </button>
  )
}
