import type { Assignment, Essay } from '../api'

export function countWords(text: string | null | undefined): number {
  if (!text) return 0
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

const dateFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
const dateTimeFmt = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})
const longDateFmt = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
})
const rtf = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' })

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso))
export const formatLongDate = (iso: string) => longDateFmt.format(new Date(iso))

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  const abs = Math.abs(diff)
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (abs < min) return 'hace un momento'
  if (abs < hour) return rtf.format(Math.round(diff / min), 'minute')
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour')
  return rtf.format(Math.round(diff / day), 'day')
}

export type DueTone = 'overdue' | 'soon' | 'ok' | 'none'

export function dueInfo(dueDate: string | null, now = Date.now()): { label: string; tone: DueTone } {
  if (!dueDate) return { label: 'Sin fecha límite', tone: 'none' }
  const diff = new Date(dueDate).getTime() - now
  const days = diff / (24 * 60 * 60 * 1000)
  if (diff < 0) return { label: `Venció ${formatRelative(dueDate, now)}`, tone: 'overdue' }
  if (days < 1) return { label: `Vence ${formatRelative(dueDate, now)}`, tone: 'soon' }
  if (days < 3) return { label: `Vence en ${Math.ceil(days)} días`, tone: 'soon' }
  return { label: `Vence el ${formatDate(dueDate)}`, tone: 'ok' }
}

export type ProgressStatus = 'not_started' | 'draft' | 'submitted' | 'graded'

export function essayStatus(essay: Essay | null | undefined): ProgressStatus {
  if (!essay) return 'not_started'
  if (essay.status === 'draft' && !essay.content.trim() && !essay.title.trim() && !essay.outline.trim()) {
    return 'not_started'
  }
  return essay.status
}

export function essayProgress(essay: Essay | null | undefined, assignment: Pick<Assignment, 'min_words'>): number {
  const status = essayStatus(essay)
  if (status === 'submitted' || status === 'graded') return 100
  if (status === 'not_started' || !essay) return 0
  const target = Math.max(assignment.min_words, 1)
  return Math.min(99, Math.round((countWords(essay.content) / target) * 100))
}

export const STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: 'Sin iniciar',
  draft: 'En progreso',
  submitted: 'Entregado',
  graded: 'Calificado',
}

export function gradeTone(grade: number): 'great' | 'good' | 'fair' | 'low' {
  if (grade >= 9) return 'great'
  if (grade >= 8) return 'good'
  if (grade >= 6) return 'fair'
  return 'low'
}

export function initials(name: string): string {
  return name
    .replace(/^(Prof\.|Profa\.|Dr\.|Dra\.)\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const AVATAR_COLORS = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-lime-100 text-lime-700',
]

export function avatarColor(seed: string): string {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function firstName(name: string): string {
  return name.replace(/^(Prof\.|Profa\.)\s*/i, '').split(/\s+/)[0]
}

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function shortTitle(title: string) {
  const idx = title.indexOf(':')
  return idx > -1 ? title.slice(idx + 1).trim() : title
}

export function essayTypeLabel(title: string) {
  const idx = title.indexOf(':')
  return idx > -1 ? title.slice(0, idx).trim() : 'Ensayo'
}

export function essayFor(essays: Essay[], assignmentId: number, studentId: number): Essay | null {
  return essays.find((e) => e.assignment_id === assignmentId && e.student_id === studentId) ?? null
}
