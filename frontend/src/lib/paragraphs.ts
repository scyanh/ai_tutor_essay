export interface ParagraphSpan {
  start: number
  end: number
  text: string
}

// Misma regla que el backend (api/agent_routes.py: split_paragraphs): bloques separados por una línea en blanco
export function paragraphSpans(text: string): ParagraphSpan[] {
  const spans: ParagraphSpan[] = []
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to)
    const trimmed = raw.trim()
    if (!trimmed) return
    const start = from + (raw.length - raw.trimStart().length)
    spans.push({ start, end: start + trimmed.length, text: trimmed })
  }
  let last = 0
  for (const match of text.matchAll(/\n\s*\n/g)) {
    push(last, match.index)
    last = match.index + match[0].length
  }
  push(last, text.length)
  return spans
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])

/**
 * Índice actual del párrafo que Sharon citó como [P n]. Si el alumno editó el texto después
 * de la respuesta, lo busca por contenido en vez de confiar en la posición. -1 si ya no existe.
 */
export function locateParagraph(n: number, snapshot: string[] | undefined, current: string[]): number {
  const index = n - 1
  const target = snapshot?.[index]
  if (target === undefined) return index >= 0 && index < current.length ? index : -1
  const exact = current.indexOf(target)
  if (exact !== -1) return exact

  const targetWords = words(target)
  let best = -1
  let bestScore = 0
  current.forEach((paragraph, i) => {
    const candidate = words(paragraph)
    let shared = 0
    targetWords.forEach((w) => candidate.has(w) && shared++)
    const score = shared / Math.max(1, new Set([...targetWords, ...candidate]).size)
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  })
  return bestScore >= 0.35 ? best : -1
}

/** Convierte las etiquetas [P3] de Sharon en enlaces #parrafo-3 que el chat dibuja como chips. */
export function linkParagraphRefs(markdown: string): string {
  return markdown.replace(/\[(?:P|¶|Párrafo)\s*(\d{1,3})\](?!\()/gi, '[Párrafo $1](#parrafo-$1)')
}
