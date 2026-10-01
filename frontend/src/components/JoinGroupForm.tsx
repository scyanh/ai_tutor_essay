import { useState, type FormEvent } from 'react'
import { ArrowRight, KeyRound } from 'lucide-react'
import { api, type StudentGroup } from '../api'
import { useToken } from '../auth/AuthContext'
import { Button, cn } from './ui'

const CODE_LENGTH = 8

function cleanCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

export default function JoinGroupForm({
  onJoined,
  autoFocus,
  size = 'md',
}: {
  onJoined: (group: StudentGroup) => void
  autoFocus?: boolean
  size?: 'md' | 'lg'
}) {
  const token = useToken()
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const complete = code.length === CODE_LENGTH

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!complete) return
    setJoining(true)
    setError(null)
    try {
      const group = await api.joinGroup(token, code)
      setCode('')
      onJoined(group)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setJoining(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label htmlFor="join-code" className="block text-sm font-medium text-slate-700">
        Clave del grupo
      </label>
      <div className={cn('flex gap-2', size === 'lg' ? 'flex-col sm:flex-row' : 'flex-col')}>
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
          <input
            id="join-code"
            autoFocus={autoFocus}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            value={code}
            onChange={(e) => {
              setCode(cleanCode(e.target.value))
              setError(null)
            }}
            placeholder="ABCD1234"
            aria-describedby="join-code-hint"
            className="block h-14 w-full rounded-xl border-0 bg-white pr-4 pl-12 font-mono text-xl font-semibold tracking-[0.2em] text-slate-900 uppercase ring-1 ring-slate-200 ring-inset placeholder:font-normal placeholder:tracking-[0.2em] placeholder:text-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <Button type="submit" size="lg" className="h-14" loading={joining} disabled={!complete}>
          Unirme
          {!joining && <ArrowRight className="size-4" />}
        </Button>
      </div>
      <p id="join-code-hint" className="text-xs text-slate-500">
        Son 8 letras y números. Pídela a tu maestro si no la tienes.
      </p>
      {error && (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset animate-fade-in">
          {error}
        </p>
      )}
    </form>
  )
}
