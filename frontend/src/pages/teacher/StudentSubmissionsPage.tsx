import { Link, useParams } from 'react-router-dom'
import { ArrowRight, BookOpen, ClipboardCheck, FileText, Mail, TrendingUp } from 'lucide-react'
import { api } from '../../api'
import { useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import {
  countWords,
  dueInfo,
  essayFor,
  essayProgress,
  essayStatus,
  essayTypeLabel,
  formatDateTime,
  shortTitle,
} from '../../lib/format'
import { Avatar, Badge, Card, EmptyState, ErrorState, GradePill, PageLoader, ProgressBar, StatusBadge } from '../../components/ui'
import { Breadcrumbs, StatCard } from '../../components/teacher'

export default function StudentSubmissionsPage() {
  const { groupId, studentId } = useParams()
  const token = useToken()
  const { data, error, loading, reload } = useAsync(() => api.getGroupOverview(token, Number(groupId)), [token, groupId])

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const { group } = data
  const student = data.students.find((s) => s.id === Number(studentId))
  if (!student) return <ErrorState error={new Error('Este alumno ya no pertenece al grupo.')} />

  const rows = data.assignments.map((assignment) => {
    const essay = essayFor(data.essays, assignment.id, student.id)
    return { assignment, essay, status: essayStatus(essay), progress: essayProgress(essay, assignment) }
  })
  const delivered = rows.filter((r) => r.status === 'submitted' || r.status === 'graded')
  const toGrade = rows.filter((r) => r.status === 'submitted')
  const graded = rows.filter((r) => r.essay?.grade != null)
  const avg = graded.length ? graded.reduce((s, r) => s + (r.essay?.grade ?? 0), 0) / graded.length : null

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs
        items={[
          { label: 'Mis grupos', to: '/maestro' },
          { label: group.name, to: `/maestro/grupos/${group.id}` },
          { label: 'Alumnos', to: `/maestro/grupos/${group.id}/alumnos` },
          { label: student.name },
        ]}
      />

      <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <Avatar name={student.name} id={student.id} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{student.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {student.email}
            </span>
            <span>{group.name}</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<BookOpen className="size-5" />}
          label="Entregados"
          value={`${delivered.length}/${rows.length}`}
          tone="brand"
        />
        <StatCard icon={<ClipboardCheck className="size-5" />} label="Por calificar" value={toGrade.length} tone="amber" />
        <StatCard
          icon={<TrendingUp className="size-5" />}
          label="Promedio"
          value={avg != null ? avg.toFixed(1) : '—'}
          hint={`${graded.length} ${graded.length === 1 ? 'calificación' : 'calificaciones'}`}
          tone="emerald"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Entregas por tarea</h2>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="size-6" />} title="Sin tareas" description="Este grupo todavía no tiene tareas." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ assignment, essay, status, progress }) => {
              const due = dueInfo(assignment.due_date)
              return (
                <li key={assignment.id}>
                  <Link
                    to={`/maestro/tareas/${assignment.id}/alumnos/${student.id}`}
                    className="group flex flex-col gap-3 px-6 py-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="brand">{essayTypeLabel(assignment.title)}</Badge>
                        <StatusBadge status={status} />
                      </div>
                      <div className="mt-1.5 truncate font-medium text-slate-900">{shortTitle(assignment.title)}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {essay?.submitted_at
                          ? `Entregado el ${formatDateTime(essay.submitted_at)}`
                          : status === 'draft'
                            ? `${countWords(essay?.content)} de ${assignment.min_words} palabras · ${due.label}`
                            : due.label}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:w-56 sm:justify-end">
                      {essay?.grade != null ? (
                        <GradePill grade={essay.grade} />
                      ) : status === 'draft' ? (
                        <ProgressBar value={progress} className="w-28" />
                      ) : null}
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 opacity-70 transition group-hover:opacity-100">
                        {status === 'submitted' ? 'Calificar' : 'Ver'}
                        <ArrowRight className="size-4" />
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
