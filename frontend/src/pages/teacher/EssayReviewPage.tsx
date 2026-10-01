import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { CircleCheck, Clock, Hourglass, ListChecks, NotebookPen, Star } from 'lucide-react'
import { api } from '../../api'
import { useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import { countWords, essayProgress, essayStatus, formatDateTime, formatRelative, gradeTone, shortTitle } from '../../lib/format'
import {
  Avatar,
  Button,
  Card,
  cn,
  EmptyState,
  ErrorState,
  GradePill,
  inputClass,
  PageLoader,
  ProgressBar,
  StatusBadge,
} from '../../components/ui'
import { Breadcrumbs } from '../../components/teacher'

const QUICK_GRADES = [6, 7, 8, 9, 10]

const TONE_TEXT = {
  great: 'text-emerald-600',
  good: 'text-sky-600',
  fair: 'text-amber-600',
  low: 'text-rose-600',
}

export default function EssayReviewPage() {
  const { assignmentId, studentId } = useParams()
  const token = useToken()
  const { data, error, loading, reload, setData } = useAsync(
    () => api.getEssayReview(token, Number(assignmentId), Number(studentId)),
    [token, assignmentId, studentId],
  )
  const [grade, setGrade] = useState('')
  const [feedback, setFeedback] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!data?.essay) return
    setGrade(data.essay.grade != null ? String(data.essay.grade) : '')
    setFeedback(data.essay.feedback ?? '')
    setEditing(data.essay.status === 'submitted')
  }, [data?.essay])

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const { assignment, student, essay } = data
  const status = essayStatus(essay)
  const words = countWords(essay?.content)
  const numericGrade = Number(grade)
  const gradeValid = grade !== '' && numericGrade >= 0 && numericGrade <= 10

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!essay || !gradeValid) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await api.gradeEssay(token, essay.id, numericGrade, feedback)
      setData({ ...data, essay: updated })
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 3000)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs
        items={[
          { label: 'Mis grupos', to: '/maestro' },
          { label: data.group.name, to: `/maestro/grupos/${data.group.id}` },
          { label: shortTitle(assignment.title), to: `/maestro/tareas/${assignment.id}` },
          { label: student.name },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4 sm:px-10">
            <StatusBadge status={status} />
            <span className="text-sm text-slate-500 tabular-nums">
              {words} palabras · meta {assignment.min_words}
            </span>
            {essay?.submitted_at && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-slate-500">
                <Clock className="size-3.5" />
                Entregado {formatDateTime(essay.submitted_at)}
              </span>
            )}
          </div>

          {status === 'not_started' ? (
            <EmptyState
              icon={<NotebookPen className="size-6" />}
              title="El alumno aún no empieza"
              description={`${student.name} no ha escrito nada para esta tarea todavía.`}
            />
          ) : (
            <article className="px-6 py-10 sm:px-14">
              {status === 'draft' && (
                <div className="mb-8 flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset">
                  <Hourglass className="size-4 shrink-0" />
                  <span>
                    Borrador en progreso. Guardado por última vez{' '}
                    {essay?.last_saved_at ? formatRelative(essay.last_saved_at) : ''}. Podrás calificarlo cuando lo entregue.
                  </span>
                </div>
              )}
              <h1 className="font-serif text-3xl leading-tight font-medium text-slate-900">
                {essay?.title || <span className="text-slate-400 italic">Sin título</span>}
              </h1>
              <div className="mt-8 font-serif text-[1.15rem] leading-[1.85] whitespace-pre-wrap text-slate-800">
                {essay?.content}
              </div>
              {/* Esquema y notas desactivado en la primera versión
              {essay?.outline && (
                <details className="group mt-10 rounded-xl bg-slate-50 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-600 select-none">
                    Esquema del alumno
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-600">{essay.outline}</p>
                </details>
              )}
              */}
            </article>
          )}
        </Card>

        <div className="space-y-4 lg:sticky lg:top-24">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={student.name} id={student.id} size="lg" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{student.name}</div>
                <div className="truncate text-sm text-slate-500">{student.email}</div>
              </div>
            </div>
            {status === 'draft' && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Avance</span>
                  <span className="tabular-nums">{essayProgress(essay, assignment)}%</span>
                </div>
                <ProgressBar value={essayProgress(essay, assignment)} className="mt-1.5 h-2" />
              </div>
            )}
          </Card>

          {essay && essay.status !== 'draft' && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                <Star className="size-4 text-amber-500" />
                <h2 className="font-semibold text-slate-900">Calificación</h2>
              </div>

              {!editing && essay.grade != null ? (
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    <GradePill grade={essay.grade} size="lg" />
                    <div>
                      <div className={cn('font-semibold', TONE_TEXT[gradeTone(essay.grade)])}>
                        {essay.grade >= 9 ? 'Excelente' : essay.grade >= 8 ? 'Muy bien' : essay.grade >= 6 ? 'Aprobado' : 'No aprobado'}
                      </div>
                      {essay.graded_at && (
                        <div className="text-xs text-slate-500">Calificado {formatRelative(essay.graded_at)}</div>
                      )}
                    </div>
                  </div>
                  {essay.feedback && (
                    <p className="mt-4 rounded-xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700">{essay.feedback}</p>
                  )}
                  {justSaved && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
                      <CircleCheck className="size-4" /> Calificación guardada. El alumno ya puede verla.
                    </p>
                  )}
                  <Button variant="secondary" className="mt-4 w-full" onClick={() => setEditing(true)}>
                    Editar calificación
                  </Button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4 p-5">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Calificación (0 – 10)</label>
                    <div className="flex items-center gap-2">
                      <div className="w-20 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          required
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                          className={cn(inputClass, 'text-center text-lg font-semibold tabular-nums')}
                          placeholder="—"
                        />
                      </div>
                      <div className="flex flex-1 gap-1">
                        {QUICK_GRADES.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setGrade(String(g))}
                            className={cn(
                              'h-9 flex-1 rounded-lg text-sm font-medium ring-1 ring-inset transition',
                              numericGrade === g && grade !== ''
                                ? 'bg-brand-600 text-white ring-brand-600'
                                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                            )}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Retroalimentación</label>
                    <textarea
                      rows={6}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      className={inputClass}
                      placeholder="¿Qué hizo bien? ¿Qué puede mejorar para el próximo ensayo?"
                    />
                  </div>
                  {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
                  <div className="flex gap-2">
                    {essay.grade != null && (
                      <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                        Cancelar
                      </Button>
                    )}
                    <Button type="submit" className="flex-1" loading={saving} disabled={!gradeValid}>
                      {essay.grade != null ? 'Actualizar calificación' : 'Publicar calificación'}
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          )}

          {assignment.rubric && (
            <Card className="p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ListChecks className="size-4 text-brand-600" /> Rúbrica
              </h3>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-600">{assignment.rubric}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
