import { API_ORIGIN } from './httpApi'
import type { DraftInput } from './types'

const AGENT_BASE = `${API_ORIGIN}/api/agent`

interface AdkPart {
  text?: string
  thought?: boolean
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string }
}

interface AdkEvent {
  author?: string
  partial?: boolean
  content?: { role?: string; parts?: AdkPart[] }
  errorCode?: string
  errorMessage?: string
  error?: string
}

export interface AgentStreamHandlers {
  onText: (fullText: string) => void
  onActivity: (label: string | null) => void
}

export class AgentUnavailableError extends Error {}

const TOOL_LABELS: Record<string, string> = {
  search_assignment_documents: 'Buscando en las lecturas del profesor…',
  get_assignment_details: 'Revisando las instrucciones de la tarea…',
  get_student_draft: 'Leyendo tu borrador…',
  save_student_draft: 'Guardando tu avance…',
  submit_student_essay: 'Procesando la entrega…',
  transfer_to_agent: 'Consultando a un especialista…',
}

const AGENT_LABELS: Record<string, string> = {
  research_specialist: 'Especialista en investigación',
  structure_specialist: 'Mentora de estructura',
  style_coach: 'Coach de estilo',
}

export async function createAgentSession(token: string, assignmentId: number): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${AGENT_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assignment_id: assignmentId }),
    })
  } catch {
    throw new AgentUnavailableError('No se pudo conectar con Sharon.')
  }
  if (!res.ok) throw new AgentUnavailableError(`Sharon no está disponible (${res.status}).`)
  const session = (await res.json()) as { id: string }
  return session.id
}

export class SessionNotFoundError extends Error {}

export async function sendAgentMessage(
  token: string,
  sessionId: string,
  text: string,
  draft: DraftInput | null,
  handlers: AgentStreamHandlers,
  signal?: AbortSignal,
): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${AGENT_BASE}/run_sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ session_id: sessionId, message: text, draft }),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new AgentUnavailableError('No se pudo conectar con Sharon.')
  }
  if (res.status === 404) throw new SessionNotFoundError()
  if (!res.ok || !res.body) throw new AgentUnavailableError(`Sharon no está disponible (${res.status}).`)

  let committed = ''
  let pending = ''
  const emit = () => handlers.onText(pending ? (committed ? `${committed}\n\n${pending}` : pending) : committed)

  const handleEvent = (event: AdkEvent) => {
    if (event.error || event.errorMessage) {
      throw new Error(event.errorMessage || event.error || 'Error del agente')
    }
    const parts = event.content?.parts ?? []
    const call = parts.find((p) => p.functionCall)?.functionCall
    if (call) {
      const target = call.name === 'transfer_to_agent' ? String(call.args?.agent_name ?? '') : ''
      handlers.onActivity(
        target && AGENT_LABELS[target] ? `Consultando a ${AGENT_LABELS[target]}…` : TOOL_LABELS[call.name] ?? 'Pensando…',
      )
      return
    }
    const text = parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join('')
    if (!text) return
    handlers.onActivity(null)
    if (event.partial) {
      pending += text
    } else {
      committed = committed ? `${committed}\n\n${text}` : text
      pending = ''
    }
    emit()
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (data) handleEvent(JSON.parse(data) as AdkEvent)
    }
  }
  handlers.onActivity(null)
  return committed || pending
}
