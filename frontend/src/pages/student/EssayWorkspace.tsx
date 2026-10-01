import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  CircleAlert,
  CircleCheck,
  Cloud,
  ExternalLink,
  CloudOff,
  FileText,
  Info,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  Send,
  Star,
  X,
} from 'lucide-react'
import { api, type DraftInput, type Essay, type StudentAssignment } from '../../api'
import { useAuth, useToken } from '../../auth/AuthContext'
import { useAsync } from '../../lib/useAsync'
import { useAutosave, type SaveState } from '../../lib/useAutosave'
import { countWords, dueInfo, formatDateTime, formatLongDate, formatRelative, gradeTone, shortTitle } from '../../lib/format'
import ChatPanel from '../../components/ChatPanel'
import { useDocumentViewer } from '../../components/DocumentViewer'
import { paragraphSpans } from '../../lib/paragraphs'
import { Button, cn, ErrorState, FullPageSpinner, GradePill, Modal } from '../../components/ui'

const MIN_SUBMIT_CHARS = 100

export default function EssayWorkspace() {
  const { assignmentId } = useParams()
  const token = useToken()
  const { data, error, reload } = useAsync(
    () => api.getStudentAssignment(token, Number(assignmentId)),
    [token, assignmentId],
  )

  if (error) {
    return (
      <div className="min-h-screen">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (!data) return <FullPageSpinner />
  return <Workspace key={data.assignment.id} initial={data} />
}

function Workspace({ initial }: { initial: StudentAssignment }) {
  const token = useToken()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { assignment, teacher } = initial
  const [essay, setEssay] = useState<Essay | null>(initial.essay)
  const [draft, setDraft] = useState<DraftInput>({
    title: initial.essay?.title ?? '',
    content: initial.essay?.content ?? '',
    outline: initial.essay?.outline ?? '',
  })
  // Esquema y notas desactivado en la primera versión
  // const [tab, setTab] = useState<'essay' | 'outline'>('essay')
  const [showInfo, setShowInfo] = useState(false)
  const [showChat, setShowChat] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const draftRef = useRef(draft)
  const { open: openDocument, viewer: documentViewer } = useDocumentViewer()
  draftRef.current = draft

  const locked = !!essay && essay.status !== 'draft'
  const words = countWords(draft.content)
  const goalPct = Math.min(100, Math.round((words / Math.max(assignment.min_words, 1)) * 100))
  const due = dueInfo(assignment.due_date)

  const save = useCallback(
    async (value: DraftInput) => {
      const updated = await api.saveDraft(token, assignment.id, value)
      setEssay(updated)
    },
    [token, assignment.id],
  )
  const { state: saveState, flush } = useAutosave(draft, save, { enabled: !locked })

  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void flush()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, flush])

  const getDraft = useCallback(() => draftRef.current, [])

  const spans = useMemo(() => paragraphSpans(draft.content), [draft.content])
  const paragraphTexts = useMemo(() => spans.map((p) => p.text), [spans])
  const [highlight, setHighlight] = useState<{ index: number; nonce: number } | null>(null)
  const highlightSpan = highlight && spans[highlight.index]

  const jumpToParagraph = useCallback((index: number) => {
    // setTab('essay')
    // En pantallas chicas el chat tapa el editor
    if (!window.matchMedia('(min-width: 1024px)').matches) setShowChat(false)
    setHighlight({ index, nonce: Date.now() })
  }, [])

  const canSubmit = draft.content.trim().length >= MIN_SUBMIT_CHARS

  const submit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await flush()
      const updated = await api.submitEssay(token, assignment.id)
      setEssay(updated)
      setConfirmOpen(false)
      setJustSubmitted(true)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="z-20 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white px-3 sm:px-5">
        <button
          onClick={() => navigate('/alumno')}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="Volver"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{shortTitle(assignment.title)}</div>
          <div className="flex items-center gap-3 overflow-hidden text-xs whitespace-nowrap text-slate-500">
            <span
              className={cn(
                'hidden items-center gap-1 sm:inline-flex',
                !locked && due.tone === 'overdue' && 'text-rose-600',
                !locked && due.tone === 'soon' && 'text-amber-600',
              )}
            >
              <Calendar className="size-3" />
              {due.label}
            </span>
            {!locked && <SaveIndicator state={saveState} lastSaved={essay?.last_saved_at ?? null} onRetry={flush} />}
          </div>
        </div>

        {!locked && (
          <div className="hidden items-center gap-2.5 md:flex" title={`${words} de ${assignment.min_words} palabras`}>
            <GoalRing pct={goalPct} />
            <div className="text-xs leading-tight">
              <div className="font-semibold text-slate-900 tabular-nums">{words} palabras</div>
              <div className="text-slate-500">meta {assignment.min_words}</div>
            </div>
          </div>
        )}

        <div className="mx-1 hidden h-8 w-px bg-slate-200 md:block" />
        <Button
          variant={showInfo ? 'secondary' : 'ghost'}
          size="sm"
          icon={<Info className="size-4" />}
          onClick={() => setShowInfo((s) => !s)}
        >
          <span className="hidden sm:inline">Instrucciones</span>
        </Button>
        <Button
          variant={showChat ? 'secondary' : 'ghost'}
          size="sm"
          icon={<MessageSquare className="size-4" />}
          onClick={() => setShowChat((s) => !s)}
        >
          <span className="hidden sm:inline">Sharon</span>
        </Button>
        {!locked && (
          <Button size="sm" icon={<Send className="size-4" />} onClick={() => setConfirmOpen(true)} disabled={!canSubmit}>
            <span className="hidden sm:inline">Enviar ensayo</span>
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {showInfo && (
          <aside className="w-full max-w-sm shrink-0 overflow-y-auto border-r border-slate-200/70 bg-white animate-fade-in scrollbar-thin max-lg:absolute max-lg:inset-y-16 max-lg:left-0 max-lg:z-10 max-lg:shadow-lift">
            <div className="flex items-center justify-between px-6 pt-5">
              <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">La tarea</h2>
              <button onClick={() => setShowInfo(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-6 px-6 py-5">
              <div>
                <h3 className="font-semibold leading-snug text-slate-900">{assignment.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{teacher.name}</p>
                {assignment.due_date && (
                  <p className="mt-1 text-sm text-slate-500 first-letter:uppercase">
                    Entrega: {formatLongDate(assignment.due_date)}
                  </p>
                )}
              </div>
              <p className="text-sm leading-relaxed text-slate-600">{assignment.description}</p>
              {assignment.rubric && (
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ListChecks className="size-4 text-brand-600" /> Rúbrica
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-600">{assignment.rubric}</p>
                </div>
              )}
              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Paperclip className="size-4 text-brand-600" /> Lecturas
                </h4>
                {assignment.documents.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">Tu maestro no adjuntó lecturas.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {assignment.documents.map((d) => (
                      <li key={d.id}>
                        <button
                          onClick={() => d.has_file && void openDocument(d)}
                          disabled={!d.has_file}
                          className={cn(
                            'flex w-full gap-2.5 rounded-xl bg-slate-50 p-3 text-left transition',
                            d.has_file && 'hover:bg-brand-50/60 hover:ring-1 hover:ring-brand-100',
                          )}
                          title={d.has_file ? 'Abrir PDF' : undefined}
                        >
                          <FileText className="mt-0.5 size-4 shrink-0 text-rose-500" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium break-words text-slate-800">{d.file_name.replace(/_/g, ' ')}</div>
                            {d.summary && <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{d.summary}</div>}
                            {d.has_file && (
                              <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                                <ExternalLink className="size-3" /> Abrir PDF
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Pídele a Sharon que busque en estas lecturas para encontrar evidencia y citas.
                </p>
              </div>
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
            {locked && essay && <DeliveredBanner essay={essay} celebrate={justSubmitted} />}

            {/* Esquema y notas desactivado en la primera versión
            {!locked && (
              <div className="mb-5 inline-flex rounded-xl bg-slate-200/60 p-1">
                {(
                  [
                    ['essay', 'Ensayo'],
                    ['outline', 'Esquema y notas'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={cn(
                      'rounded-lg px-4 py-1.5 text-sm font-medium transition',
                      tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            */}

            <div className="min-h-[70vh] rounded-2xl border border-slate-200/80 bg-white px-6 py-10 shadow-soft sm:px-14 sm:py-14">
              {/* {tab === 'essay' || locked ? ( */}
                <>
                  <AutoTextarea
                    value={draft.title}
                    onChange={(title) => setDraft((d) => ({ ...d, title }))}
                    readOnly={locked}
                    placeholder="Título de tu ensayo"
                    className="font-serif text-3xl leading-tight font-medium text-slate-900 placeholder:text-slate-300"
                  />
                  <div className="my-6 h-px bg-slate-100" />
                  <ParagraphEditor
                    value={draft.content}
                    onChange={(content) => setDraft((d) => ({ ...d, content }))}
                    readOnly={locked}
                    autoFocus={!locked && !!draft.title}
                    placeholder="Empieza a escribir tu ensayo aquí. Si no sabes cómo empezar, pregúntale a Sharon: ella te ayudará a encontrar tu tesis."
                    highlight={
                      highlight && highlightSpan
                        ? { ...highlightSpan, index: highlight.index, nonce: highlight.nonce }
                        : null
                    }
                    onHighlightEnd={() => setHighlight(null)}
                  />
                </>
              {/* ) : (
                <>
                  <h2 className="font-serif text-2xl font-medium text-slate-900">Esquema y notas</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Organiza tu tesis, argumentos y evidencias antes de redactar. Solo tú y tu maestro lo ven.
                  </p>
                  <div className="my-6 h-px bg-slate-100" />
                  <AutoTextarea
                    value={draft.outline}
                    onChange={(outline) => setDraft((d) => ({ ...d, outline }))}
                    autoFocus
                    placeholder={'Tesis: …\n\n- Argumento 1: …\n  Evidencia: …\n- Argumento 2: …\n- Contraargumento: …'}
                    className="min-h-[50vh] text-[15px] leading-7 text-slate-700 placeholder:text-slate-300"
                  />
                </>
              )} */}
            </div>

            {!locked && (
              <p className="mt-4 text-center text-xs text-slate-400">
                Tu avance se guarda automáticamente · <kbd className="font-sans">⌘/Ctrl + S</kbd> para guardar ahora
              </p>
            )}
          </div>
        </main>

        {showChat && (
          <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-md shrink-0 border-l border-slate-200/70 shadow-lift animate-fade-in lg:static lg:w-[26rem] lg:max-w-none lg:shadow-none">
            <ChatPanel
              user={user}
              assignment={assignment}
              getDraft={getDraft}
              readOnly={locked}
              onClose={() => setShowChat(false)}
              paragraphs={paragraphTexts}
              onJumpToParagraph={jumpToParagraph}
            />
          </aside>
        )}
      </div>

      {documentViewer}

      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="¿Enviar tu ensayo?"
        description={`Se lo entregarás a ${teacher.name}. Después de enviarlo ya no podrás editarlo.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Seguir editando
            </Button>
            <Button variant="success" icon={<Send className="size-4" />} loading={submitting} onClick={submit}>
              Sí, enviar ensayo
            </Button>
          </>
        }
      >
        <ul className="space-y-3">
          <CheckItem ok={!!draft.title.trim()} label="Tiene título" warn="Tu ensayo no tiene título." />
          <CheckItem
            ok={words >= assignment.min_words}
            label={`Cumple la extensión mínima (${words}/${assignment.min_words} palabras)`}
            warn={`Llevas ${words} de ${assignment.min_words} palabras sugeridas.`}
          />
          <CheckItem
            ok={due.tone !== 'overdue'}
            label="Se entrega a tiempo"
            warn="La fecha límite ya pasó; se registrará como entrega tardía."
          />
        </ul>
        {submitError && (
          <p className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{submitError}</p>
        )}
      </Modal>
    </div>
  )
}

function SaveIndicator({
  state,
  lastSaved,
  onRetry,
}: {
  state: SaveState
  lastSaved: string | null
  onRetry: () => void
}) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (state === 'saving' || state === 'dirty') {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <LoaderCircle className="size-3 animate-spin" /> Guardando…
      </span>
    )
  }
  if (state === 'error') {
    return (
      <button onClick={onRetry} className="inline-flex items-center gap-1 font-medium text-rose-600 hover:underline">
        <CloudOff className="size-3" /> No se pudo guardar · Reintentar
      </button>
    )
  }
  if (!lastSaved) return null
  return (
    <span className="inline-flex items-center gap-1 text-emerald-600">
      {state === 'saved' ? <CircleCheck className="size-3" /> : <Cloud className="size-3" />}
      Guardado {formatRelative(lastSaved)}
    </span>
  )
}

function GoalRing({ pct }: { pct: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-slate-100" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className={cn('transition-[stroke-dashoffset] duration-500', pct >= 100 ? 'stroke-emerald-500' : 'stroke-brand-500')}
      />
    </svg>
  )
}

const ESSAY_TYPE = 'font-serif text-[1.15rem] leading-[1.85]'

function ParagraphEditor({
  value,
  onChange,
  readOnly,
  autoFocus,
  placeholder,
  highlight,
  onHighlightEnd,
}: {
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  autoFocus?: boolean
  placeholder?: string
  highlight: { start: number; end: number; index: number; nonce: number } | null
  onHighlightEnd: () => void
}) {
  const markRef = useRef<HTMLElement>(null)
  const [badgeTop, setBadgeTop] = useState<number | null>(null)
  const nonce = highlight?.nonce

  useEffect(() => {
    setBadgeTop(null)
    if (nonce === undefined) return
    const frame = requestAnimationFrame(() => {
      const mark = markRef.current
      if (!mark) return
      setBadgeTop(mark.offsetTop)
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [nonce])

  return (
    <div className="relative">
      {highlight && (
        // Copia invisible del texto detrás del textarea: el <mark> queda exactamente bajo el párrafo citado
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 break-words whitespace-pre-wrap text-transparent select-none',
            ESSAY_TYPE,
          )}
        >
          {value.slice(0, highlight.start)}
          <mark key={highlight.nonce} ref={markRef} onAnimationEnd={onHighlightEnd} className="paragraph-flash">
            {value.slice(highlight.start, highlight.end)}
          </mark>
          {value.slice(highlight.end)}
        </div>
      )}
      {highlight && badgeTop !== null && (
        <span
          key={`badge-${highlight.nonce}`}
          style={{ top: badgeTop }}
          className="paragraph-badge absolute -left-12 hidden h-7 items-center gap-0.5 rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset sm:inline-flex"
        >
          ¶ {highlight.index + 1}
        </span>
      )}
      <AutoTextarea
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={cn('relative min-h-[50vh] text-slate-800 placeholder:text-slate-300', ESSAY_TYPE)}
      />
    </div>
  )
}

function AutoTextarea({
  value,
  onChange,
  className,
  placeholder,
  readOnly,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  readOnly?: boolean
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      readOnly={readOnly}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck
      lang="es"
      className={cn('block w-full resize-none overflow-hidden bg-transparent focus:outline-none', className)}
    />
  )
}

function CheckItem({ ok, label, warn }: { ok: boolean; label: string; warn: string }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      {ok ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
      )}
      <span className={ok ? 'text-slate-700' : 'text-amber-700'}>{ok ? label : warn}</span>
    </li>
  )
}

function DeliveredBanner({ essay, celebrate }: { essay: Essay; celebrate: boolean }) {
  if (essay.status === 'graded' && essay.grade != null) {
    const tone = gradeTone(essay.grade)
    return (
      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft animate-fade-in">
        <div
          className={cn(
            'flex items-center gap-4 px-6 py-5',
            tone === 'great' ? 'bg-emerald-50/70' : tone === 'good' ? 'bg-sky-50/70' : tone === 'fair' ? 'bg-amber-50/70' : 'bg-rose-50/70',
          )}
        >
          <GradePill grade={essay.grade} size="lg" />
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Star className="size-4 text-amber-500" /> Tu ensayo fue calificado
            </div>
            {essay.graded_at && <div className="text-sm text-slate-500">{formatDateTime(essay.graded_at)}</div>}
          </div>
        </div>
        {essay.feedback && (
          <div className="border-t border-slate-100 px-6 py-5">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Comentarios de tu maestro</div>
            <p className="mt-2 font-serif text-lg leading-relaxed text-slate-700 italic">“{essay.feedback}”</p>
          </div>
        )}
      </div>
    )
  }
  return (
    <div
      className={cn(
        'mb-6 flex items-center gap-4 rounded-2xl px-6 py-5 ring-1 ring-inset animate-fade-in',
        celebrate ? 'bg-emerald-50 ring-emerald-200' : 'bg-sky-50 ring-sky-200',
      )}
    >
      <div
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-full',
          celebrate ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white',
        )}
      >
        <CircleCheck className="size-6" />
      </div>
      <div>
        <div className="font-semibold text-slate-900">
          {celebrate ? '¡Listo! Tu ensayo fue enviado.' : 'Ensayo entregado'}
        </div>
        <div className="text-sm text-slate-600">
          {essay.submitted_at && <>Entregado el {formatDateTime(essay.submitted_at)} · </>}
          Aquí verás tu calificación cuando tu maestro lo revise.{' '}
          <Link to="/alumno" className="font-medium text-brand-600 hover:underline">
            Volver a mis tareas
          </Link>
        </div>
      </div>
    </div>
  )
}
