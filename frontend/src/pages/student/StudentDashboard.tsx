import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Calendar,
  CircleCheck,
  Clock,
  KeyRound,
  MessageSquare,
  PartyPopper,
  Plus,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { api, type StudentAssignment, type StudentGroup } from '../../api'
import { useAuth, useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import {
  countWords,
  dueInfo,
  essayProgress,
  essayStatus,
  essayTypeLabel,
  firstName,
  formatRelative,
  greeting,
  shortTitle,
} from '../../lib/format'
import {
  Badge,
  Card,
  cn,
  EmptyState,
  ErrorState,
  GradePill,
  Modal,
  PageLoader,
  ProgressBar,
  StatusBadge,
} from '../../components/ui'
import JoinGroupForm from '../../components/JoinGroupForm'

export default function StudentDashboard() {
  const token = useToken()
  const { user, refreshUser } = useAuth()
  const { data: bundle, error, loading, reload } = useAsync(
    () => Promise.all([api.getStudentGroups(token), api.getStudentAssignments(token)]),
    [token],
  )
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState<StudentGroup | null>(null)

  if (loading && !bundle) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!bundle || !user) return null

  const [groups, data] = bundle
  const onJoined = (group: StudentGroup) => {
    setJoined(group)
    setJoining(false)
    refreshUser().catch(() => undefined)
    reload()
  }

  if (groups.length === 0) return <JoinFirstGroup name={user.name} onJoined={onJoined} />

  const byDue = (a: StudentAssignment, b: StudentAssignment) =>
    (a.assignment.due_date ?? '9999').localeCompare(b.assignment.due_date ?? '9999')
  const pending = data.filter((i) => !i.essay || i.essay.status === 'draft').sort(byDue)
  const delivered = data
    .filter((i) => i.essay && i.essay.status !== 'draft')
    .sort((a, b) => (b.essay?.submitted_at ?? '').localeCompare(a.essay?.submitted_at ?? ''))
  const graded = delivered.filter((i) => i.essay?.grade != null)
  const avg = graded.length ? graded.reduce((s, i) => s + (i.essay?.grade ?? 0), 0) / graded.length : null
  const next = pending.find((i) => dueInfo(i.assignment.due_date).tone !== 'overdue') ?? pending[0]

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {groups.map((g) => (
              <span
                key={g.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                title={`Maestro: ${g.teacher_name}`}
              >
                <UsersRound className="size-3.5" />
                {g.name}
              </span>
            ))}
            <button
              onClick={() => setJoining(true)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200 ring-inset transition hover:bg-white hover:text-brand-700"
            >
              <Plus className="size-3.5" />
              Unirme a otro grupo
            </button>
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {greeting()}, {firstName(user.name)}
          </h1>
          <p className="mt-1 text-slate-500">
            {pending.length === 0
              ? '¡No tienes ensayos pendientes! Buen trabajo.'
              : `Tienes ${pending.length} ${pending.length === 1 ? 'ensayo pendiente' : 'ensayos pendientes'} por entregar.`}
          </p>
        </div>
        <div className="flex gap-3">
          <MiniStat label="Pendientes" value={pending.length} />
          <MiniStat label="Entregados" value={delivered.length} />
          <MiniStat label="Promedio" value={avg != null ? avg.toFixed(1) : '—'} />
        </div>
      </div>

      {joined && (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-5 py-4 text-sm text-emerald-800 ring-1 ring-emerald-200 ring-inset animate-fade-in">
          <CircleCheck className="size-5 shrink-0" />
          <span className="flex-1">
            Te uniste a <strong className="font-semibold">{joined.name}</strong> con {joined.teacher_name}. Sus tareas ya
            aparecen aquí.
          </span>
          <button onClick={() => setJoined(null)} className="text-emerald-700/70 hover:text-emerald-900">
            Cerrar
          </button>
        </div>
      )}

      {next && <NextUpBanner item={next} />}

      <section>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Por entregar</h2>
        {pending.length === 0 ? (
          <Card>
            <EmptyState
              icon={<PartyPopper className="size-6" />}
              title="Todo entregado"
              description="Cuando tus maestros asignen un nuevo ensayo aparecerá aquí."
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pending.map((item) => (
              <PendingCard key={item.assignment.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {delivered.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Entregados</h2>
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {delivered.map((item) => (
              <DeliveredRow key={item.assignment.id} item={item} />
            ))}
          </Card>
        </section>
      )}

      <Modal
        open={joining}
        onClose={() => setJoining(false)}
        title="Unirme a otro grupo"
        description="Escribe la clave que te compartió tu maestro."
      >
        <JoinGroupForm autoFocus onJoined={onJoined} />
      </Modal>
    </div>
  )
}

function JoinFirstGroup({ name, onJoined }: { name: string; onJoined: (group: StudentGroup) => void }) {
  return (
    <div className="mx-auto max-w-2xl py-6 animate-fade-in sm:py-12">
      <div className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/25">
          <KeyRound className="size-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">
          {greeting()}, {firstName(name)}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-slate-500">
          Para ver tus tareas tienes que unirte al grupo de tu maestro. Escribe la clave que te compartió.
        </p>
      </div>
      <Card className="mt-8 p-6 sm:p-8">
        <JoinGroupForm autoFocus size="lg" onJoined={onJoined} />
      </Card>
      <ol className="mt-8 grid gap-4 text-sm text-slate-500 sm:grid-cols-3">
        {[
          'Pide a tu maestro la clave de tu grupo.',
          'Escríbela aquí arriba y presiona «Unirme».',
          'Tus tareas aparecerán en esta página.',
        ].map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-24 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-soft">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  )
}

function NextUpBanner({ item }: { item: StudentAssignment }) {
  const { assignment, essay } = item
  const status = essayStatus(essay)
  const progress = essayProgress(essay, assignment)
  const due = dueInfo(assignment.due_date)

  return (
    <Link
      to={`/alumno/ensayo/${assignment.id}`}
      className="group relative block overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-7 text-white shadow-lift sm:p-8"
    >
      <div className="pointer-events-none absolute -top-20 -right-16 size-72 rounded-full bg-fuchsia-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-brand-100">
            <Sparkles className="size-4" />
            <span className="font-medium">Tu siguiente ensayo</span>
            <span className="text-brand-300">·</span>
            <span className={cn(due.tone === 'soon' && 'font-medium text-amber-200')}>{due.label}</span>
          </div>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight">{shortTitle(assignment.title)}</h2>
          <div className="mt-5 flex max-w-md items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm text-brand-100 tabular-nums">
              {countWords(essay?.content)}/{assignment.min_words} palabras
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-brand-50 ring-1 ring-white/15 lg:flex">
            <MessageSquare className="size-4" /> Sharon está lista para ayudarte
          </div>
          <span className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 font-medium text-brand-700 shadow-sm transition group-hover:gap-3">
            {status === 'not_started' ? 'Comenzar' : 'Continuar escribiendo'}
            <ArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  )
}

function PendingCard({ item }: { item: StudentAssignment }) {
  const { assignment, essay, teacher, group } = item
  const status = essayStatus(essay)
  const progress = essayProgress(essay, assignment)
  const due = dueInfo(assignment.due_date)
  const words = countWords(essay?.content)

  return (
    <Link to={`/alumno/ensayo/${assignment.id}`} className="group block">
      <Card className="flex h-full flex-col p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lift">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="brand">{essayTypeLabel(assignment.title)}</Badge>
          <StatusBadge status={status} />
        </div>
        <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-slate-900">{shortTitle(assignment.title)}</h3>
        <p className="mt-1 truncate text-sm text-slate-500">
          {teacher.name} · {group.name}
        </p>
        <p className="mt-3 line-clamp-2 text-sm text-slate-500">{assignment.description}</p>

        <div className="mt-auto pt-5">
          <div className="flex justify-between text-xs text-slate-500">
            <span className="tabular-nums">
              {words} / {assignment.min_words} palabras
            </span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <ProgressBar value={progress} className="mt-1.5" />
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium',
                due.tone === 'overdue' ? 'text-rose-600' : due.tone === 'soon' ? 'text-amber-600' : 'text-slate-500',
              )}
            >
              <Calendar className="size-3.5" />
              {due.label}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition group-hover:gap-2">
              {status === 'not_started' ? 'Comenzar' : 'Continuar'}
              <ArrowRight className="size-4" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  )
}

function DeliveredRow({ item }: { item: StudentAssignment }) {
  const { assignment, essay } = item
  if (!essay) return null
  return (
    <Link
      to={`/alumno/ensayo/${assignment.id}`}
      className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-5"
    >
      <div
        className={cn(
          'hidden size-10 shrink-0 place-items-center rounded-xl sm:grid',
          essay.grade != null ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600',
        )}
      >
        {essay.grade != null ? <CircleCheck className="size-5" /> : <Clock className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-900">{shortTitle(assignment.title)}</div>
        <div className="truncate text-sm text-slate-500">
          {essay.grade != null && essay.feedback
            ? `“${essay.feedback}”`
            : `Entregado ${essay.submitted_at ? formatRelative(essay.submitted_at) : ''} · esperando calificación`}
        </div>
      </div>
      {essay.grade != null ? (
        <GradePill grade={essay.grade} />
      ) : (
        <StatusBadge status="submitted" />
      )}
    </Link>
  )
}
