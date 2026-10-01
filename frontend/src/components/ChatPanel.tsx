import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createPortal } from 'react-dom'
import { ArrowUp, CircleAlert, PanelRightClose, Pilcrow, RotateCcw, Sparkles, SquarePen } from 'lucide-react'
import type { Assignment, DraftInput, User } from '../api'
import {
  AgentUnavailableError,
  createAgentSession,
  sendAgentMessage,
  SessionNotFoundError,
} from '../api/agent'
import { useToken } from '../auth/AuthContext'
import { firstName } from '../lib/format'
import { linkParagraphRefs, locateParagraph, paragraphSpans } from '../lib/paragraphs'
import { cn } from './ui'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  error?: boolean
  // Párrafos del borrador cuando se envió la pregunta: permiten ubicar las citas [P n] aunque el texto cambie
  paragraphs?: string[]
}

interface StoredChat {
  sessionId: string | null
  messages: ChatMessage[]
}

const SUGGESTIONS = [
  '¿Mi tesis es clara y debatible?',
  'Ayúdame a organizar mis argumentos',
  '¿Qué dicen las lecturas del profesor sobre este tema?',
  'Revisa la redacción de mi último párrafo',
]

const uid = () => Math.random().toString(36).slice(2, 10)

function withoutFailed(messages: ChatMessage[]) {
  return messages.filter((m, i) => !m.error && !(m.role === 'user' && messages[i + 1]?.error))
}

function storageKey(userId: number, assignmentId: number) {
  return `sharon.chat.${userId}.${assignmentId}`
}

function loadChat(key: string): StoredChat {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as StoredChat
  } catch {
    // historial ilegible: se empieza de cero
  }
  return { sessionId: null, messages: [] }
}

export default function ChatPanel({
  user,
  assignment,
  getDraft,
  readOnly,
  onClose,
  paragraphs,
  onJumpToParagraph,
}: {
  user: User
  assignment: Assignment
  getDraft: () => DraftInput
  readOnly?: boolean
  onClose?: () => void
  paragraphs: string[]
  onJumpToParagraph: (index: number) => void
}) {
  const token = useToken()
  const key = storageKey(user.id, assignment.id)
  const [chat, setChat] = useState<StoredChat>(() => loadChat(key))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastSentDraft = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ ...chat, messages: withoutFailed(chat.messages) }))
    } catch {
      // sin espacio en localStorage: el historial solo vive en memoria
    }
  }, [key, chat])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.messages, activity])

  const updateMessage = (id: string, patch: Partial<ChatMessage>) =>
    setChat((c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      setInput('')
      setBusy(true)
      setActivity('Pensando…')
      const userMsg: ChatMessage = { id: uid(), role: 'user', text: trimmed }
      const replyId = uid()
      const snapshot = paragraphSpans(getDraft().content).map((p) => p.text)
      setChat((c) => ({
        ...c,
        messages: [
          ...withoutFailed(c.messages),
          userMsg,
          { id: replyId, role: 'assistant', text: '', paragraphs: snapshot },
        ],
      }))

      const controller = new AbortController()
      abortRef.current = controller

      const run = async (sessionId: string | null, fresh: boolean, retried = false): Promise<void> => {
        let sid = sessionId
        if (!sid) {
          sid = await createAgentSession(token, assignment.id)
          setChat((c) => ({ ...c, sessionId: sid }))
          fresh = true
        }
        const draft = getDraft()
        const draftKey = JSON.stringify(draft)
        const sendDraft = fresh || lastSentDraft.current !== draftKey
        try {
          await sendAgentMessage(
            token,
            sid,
            trimmed,
            sendDraft ? draft : null,
            { onText: (t) => updateMessage(replyId, { text: t }), onActivity: setActivity },
            controller.signal,
          )
          lastSentDraft.current = draftKey
        } catch (err) {
          if (err instanceof SessionNotFoundError && !retried) return run(null, true, true)
          throw err
        }
      }

      try {
        await run(chat.sessionId, lastSentDraft.current === null)
        setChat((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === replyId && !m.text ? { ...m, text: 'No obtuve respuesta. ¿Puedes intentarlo de nuevo?' } : m,
          ),
        }))
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const message =
          err instanceof AgentUnavailableError
            ? `${err.message} Verifica que el backend esté corriendo.`
            : `Ocurrió un problema al hablar con Sharon: ${(err as Error).message}`
        updateMessage(replyId, { text: message, error: true })
        setInput((current) => current || trimmed)
      } finally {
        setBusy(false)
        setActivity(null)
        abortRef.current = null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, chat.sessionId, token, assignment, getDraft],
  )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(input)
    }
  }

  const newConversation = () => {
    abortRef.current?.abort()
    lastSentDraft.current = null
    setChat({ sessionId: null, messages: [] })
    inputRef.current?.focus()
  }

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  const last = chat.messages[chat.messages.length - 1]
  const replies = last?.role === 'assistant' && !last.error ? quickReplies(last.text) : []

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
        <SharonAvatar />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="font-semibold text-slate-900">Sharon</div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Tu tutora de escritura
          </div>
        </div>
        {chat.messages.length > 0 && (
          <button
            onClick={newConversation}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Nueva conversación"
          >
            <SquarePen className="size-4" />
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Ocultar chat"
          >
            <PanelRightClose className="size-4" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5 scrollbar-thin">
        <AssistantBubble>
          <p>
            ¡Hola, {firstName(user.name)}! Soy Sharon. Estoy aquí para ayudarte a pensar, organizar y mejorar tu ensayo
            — pero las ideas y las palabras serán siempre tuyas. ✍️
          </p>
          <p>Puedo ver lo que llevas escrito en el editor. ¿Por dónde quieres empezar?</p>
        </AssistantBubble>

        {chat.messages.length === 0 && !readOnly && (
          <div className="flex flex-col items-start gap-2 pl-10">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-1.5 text-left text-sm text-brand-700 transition hover:border-brand-200 hover:bg-brand-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {chat.messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end animate-fade-in">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white">
                {m.text}
              </div>
            </div>
          ) : m.text ? (
            <AssistantBubble key={m.id} error={m.error}>
              {m.error ? (
                <>
                  <p>{m.text}</p>
                  <button
                    onClick={() => void send(input)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 hover:underline"
                  >
                    <RotateCcw className="size-3" /> Reintentar
                  </button>
                </>
              ) : (
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => {
                      const ref = href?.match(/^#parrafo-(\d+)$/)
                      if (!ref) {
                        return (
                          <a href={href} target="_blank" rel="noreferrer">
                            {children}
                          </a>
                        )
                      }
                      const index = locateParagraph(Number(ref[1]), m.paragraphs, paragraphs)
                      return (
                        <ParagraphChip
                          index={index}
                          cited={Number(ref[1])}
                          preview={index >= 0 ? paragraphs[index] : null}
                          onJump={onJumpToParagraph}
                        />
                      )
                    },
                  }}
                >
                  {linkParagraphRefs(asMarkdownBullets(m.text))}
                </Markdown>
              )}
            </AssistantBubble>
          ) : null,
        )}

        {!busy && !readOnly && replies.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-10 animate-fade-in">
            {replies.map((reply) => (
              <button
                key={reply}
                onClick={() => void send(reply)}
                className="rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-1.5 text-sm text-brand-700 transition hover:border-brand-200 hover:bg-brand-50"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {activity && (
          <div className="flex items-center gap-3 pl-1 animate-fade-in">
            <SharonAvatar small />
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3.5 py-2 text-xs text-slate-500">
              <span className="flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-brand-400" />
              </span>
              {activity}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-slate-100 p-4">
        <div className="flex items-end gap-2 rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200 transition ring-inset focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Pregúntale a Sharon…"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400"
            aria-label="Enviar mensaje"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </div>
  )
}

function SharonAvatar({ small }: { small?: boolean }) {
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-sm',
        small ? 'size-7' : 'size-9',
      )}
    >
      <Sparkles className={small ? 'size-3.5' : 'size-4'} />
    </div>
  )
}

function AssistantBubble({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <div className="flex gap-3 animate-fade-in">
      <SharonAvatar small />
      <div
        className={cn(
          'prose-chat min-w-0 max-w-[88%] rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed',
          error ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200 ring-inset' : 'bg-slate-50 text-slate-700',
        )}
      >
        {error && <CircleAlert className="mb-1 size-4" />}
        {children}
      </div>
    </div>
  )
}


const TOOLTIP_WIDTH = 256

// El modelo a veces escribe viñetas «•» que Markdown no reconoce como lista
function asMarkdownBullets(text: string) {
  return text.replace(/^[ \t]*[•·▪][ \t]+/gm, '- ')
}

function firstLine(paragraph: string) {
  return paragraph.split('\n')[0]
}

// Respuestas de un clic cuando Sharon termina con una pregunta, para avanzar por sus observaciones.
// «Sí» solo aplica cuando propone el siguiente paso; ante una pregunta abierta el alumno escribe su respuesta.
const PROPOSAL = /¿\s*(empezamos|empecemos|seguimos|sigamos|continuamos|pasamos|vamos|revisamos|quieres|te gustaría|te parece)\b[^¿]*\?[\s*_)»"]*$/i

function quickReplies(text: string): string[] {
  if (!/\?[\s*_)»"]*$/.test(text)) return []
  return PROPOSAL.test(text) ? ['Sí', 'Explícame mejor'] : ['Explícame mejor']
}

function ParagraphChip({
  index,
  cited,
  preview,
  onJump,
}: {
  index: number
  cited: number
  preview: string | null
  onJump: (index: number) => void
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  if (index < 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-px align-baseline text-[0.8em] font-medium text-slate-400 line-through decoration-slate-300"
        title="Ese párrafo cambió o ya no existe en tu borrador"
      >
        <Pilcrow className="size-3" />
        {cited}
      </span>
    )
  }
  return (
    <span className="inline-block align-baseline">
      <button
        type="button"
        onClick={() => onJump(index)}
        onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setAnchor(null)}
        onFocus={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        onBlur={() => setAnchor(null)}
        className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-50 px-1.5 py-px align-bottom text-[0.8em] text-brand-700 ring-1 ring-brand-200 transition ring-inset hover:bg-brand-100 hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-brand-500"
        aria-label={`Ir al párrafo ${index + 1} del ensayo`}
      >
        <Pilcrow className="size-3 shrink-0" />
        <span className="shrink-0 font-semibold">{index + 1}</span>
        {preview && <span className="max-w-[14rem] truncate font-normal italic text-brand-600">{firstLine(preview)}</span>}
      </button>
      {preview &&
        anchor &&
        // En un portal para que el área con scroll del chat no la recorte
        createPortal(
          <span
            role="tooltip"
            style={{
              left: Math.min(Math.max(anchor.left + anchor.width / 2 - TOOLTIP_WIDTH / 2, 8), window.innerWidth - TOOLTIP_WIDTH - 8),
              top: anchor.top - 8,
              width: TOOLTIP_WIDTH,
            }}
            className="pointer-events-none fixed z-50 -translate-y-full rounded-xl bg-slate-900 px-3 py-2.5 text-left text-xs leading-relaxed text-slate-100 shadow-lift animate-pop"
          >
            <span className="line-clamp-3 font-serif text-[13px] italic">«{preview}»</span>
            <span className="mt-1.5 block text-[11px] font-medium text-brand-200">Clic para ir al párrafo →</span>
          </span>,
          document.body,
        )}
    </span>
  )
}
