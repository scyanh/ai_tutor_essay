import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, Target } from 'lucide-react'
import { api, type User } from '../../api'
import { useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import {
  countWords,
  dueInfo,
  essayFor,
  essayProgress,
  essayStatus,
  essayTypeLabel,
  formatLongDate,
  formatRelative,
  shortTitle,
  type ProgressStatus,
} from '../../lib/format'
import DocumentsPanel from '../../components/DocumentsPanel'
import RubricEditor from '../../components/RubricEditor'
import { Breadcrumbs } from '../../components/teacher'
import { Avatar, Badge, Button, Card, cn, ErrorState, GradePill, PageLoader, ProgressBar, StatusBadge } from '../../components/ui'

const STATUS_ORDER: Record<ProgressStatus, number> = { submitted: 0, draft: 1, not_started: 2, graded: 3 }

export default function AssignmentDetail() {
  const { assignmentId } = useParams()
  const token = useToken()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(
    () => api.getAssignmentOverview(token, Number(assignmentId)),
    [token, assignmentId],
  )

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const { assignment, group } = data
  const due = dueInfo(assignment.due_date)
  const toRow = (student: User, former: boolean) => {
    const essay = essayFor(data.essays, assignment.id, student.id)
    return { student, former, essay, status: essayStatus(essay), progress: essayProgress(essay, assignment) }
  }
  const byStatus = (a: ReturnType<typeof toRow>, b: ReturnType<typeof toRow>) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.progress - a.progress
  const members = data.students.map((s) => toRow(s, false)).sort(byStatus)
  const rows = [...members, ...data.former_students.map((s) => toRow(s, true)).sort(byStatus)]

  const delivered = members.filter((r) => r.status === 'submitted' || r.status === 'graded').length
  const graded = members.filter((r) => r.essay?.grade != null)
  const avg = graded.length ? graded.reduce((s, r) => s + (r.essay?.grade ?? 0), 0) / graded.length : null

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs
        items={[
          { label: 'Mis grupos', to: '/maestro' },
          { label: group.name, to: `/maestro/grupos/${group.id}` },
          { label: 'Tareas', to: `/maestro/grupos/${group.id}/tareas` },
          { label: shortTitle(assignment.title) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{essayTypeLabel(assignment.title)}</Badge>
            <Badge tone={due.tone === 'overdue' ? 'slate' : due.tone === 'soon' ? 'amber' : 'emerald'}>
              <Calendar className="size-3" />
              {due.label}
            </Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{shortTitle(assignment.title)}</h1>
          {assignment.due_date && (
            <p className="mt-1 text-sm text-slate-500 first-letter:uppercase">Entrega: {formatLongDate(assignment.due_date)}</p>
          )}
          <p className="mt-5 leading-relaxed text-slate-600">{assignment.description}</p>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <RubricEditor key={assignment.id} assignmentId={assignment.id} initial={assignment.rubric} />
            <DocumentsPanel assignmentId={assignment.id} initial={assignment.documents} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-sm font-medium text-slate-500">Entregados</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-slate-900 tabular-nums">{delivered}</span>
              <span className="text-slate-400">/ {members.length}</span>
            </div>
            <ProgressBar value={(delivered / Math.max(members.length, 1)) * 100} className="mt-3 h-2" />
          </Card>
          <Card className="grid grid-cols-2 divide-x divide-slate-100">
            <div className="p-5">
              <div className="text-sm font-medium text-slate-500">Promedio</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{avg != null ? avg.toFixed(1) : '—'}</div>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-1 text-sm font-medium text-slate-500">
                <Target className="size-3.5" /> Meta
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
                {assignment.min_words}
                <span className="ml-1 text-sm font-normal text-slate-400">palabras</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Progreso de los alumnos</h2>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <th className="px-6 py-3 font-medium">Alumno</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="w-64 px-4 py-3 font-medium">Avance</th>
                <th className="px-4 py-3 font-medium">Última actividad</th>
                <th className="px-4 py-3 font-medium">Calificación</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ student, former, essay, status, progress }) => {
                const words = countWords(essay?.content)
                const activity = essay?.submitted_at ?? essay?.last_saved_at
                return (
                  <tr key={student.id} className="transition hover:bg-slate-50/60">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={student.name} id={student.id} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium text-slate-900">
                            {student.name}
                            {former && <Badge>Ya no está en el grupo</Badge>}
                          </div>
                          <div className="max-w-[16rem] truncate text-xs text-slate-500">
                            {essay?.title || <span className="italic">Sin título</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <ProgressBar value={progress} status={status} />
                        <span className="w-20 shrink-0 text-right text-xs text-slate-500 tabular-nums">
                          {words}/{assignment.min_words}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      {activity && status !== 'not_started' ? formatRelative(activity) : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      {essay?.grade != null ? <GradePill grade={essay.grade} /> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Button
                        size="sm"
                        variant={status === 'submitted' ? 'primary' : 'secondary'}
                        className={cn(status === 'not_started' && 'opacity-60')}
                        onClick={() => navigate(`/maestro/tareas/${assignment.id}/alumnos/${student.id}`)}
                      >
                        {status === 'submitted' ? 'Calificar' : status === 'graded' ? 'Ver calificación' : 'Ver avance'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
