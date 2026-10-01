import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, GraduationCap, Lock, ShieldCheck, User } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Button, cn } from '../components/ui'
import AuthLayout from '../components/AuthLayout'

const DEMO_ACCOUNTS = [
  { label: 'Admin', name: 'Administración', username: 'admin@gmail.com', password: '1234', icon: ShieldCheck },
  { label: 'Maestro', name: 'Prof. Roberto Ramírez', username: 'teacher@gmail.com', password: '1234', icon: GraduationCap },
  { label: 'Alumno', name: 'Carlos Gómez', username: 'user@gmail.com', password: '1234', icon: User },
]

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Inicia sesión</h1>
      <p className="mt-1.5 text-sm text-slate-500">Ingresa con tu correo y contraseña.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">
            Usuario o correo
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="username"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="tu@correo.com"
              className="block h-11 w-full rounded-xl border-0 bg-white pr-3.5 pl-10 text-sm text-slate-900 ring-1 ring-slate-200 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="block h-11 w-full rounded-xl border-0 bg-white pr-11 pl-10 text-sm text-slate-900 ring-1 ring-slate-200 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset animate-fade-in">
            {error}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Entrar
          {!loading && <ArrowRight className="size-4" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        ¿Eres alumno y aún no tienes cuenta?{' '}
        <Link to="/registro" className="font-medium text-brand-600 hover:text-brand-700">
          Regístrate
        </Link>
      </p>

      {import.meta.env.DEV && (
        <div className="mt-10">
          <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-slate-400 uppercase">
            <span className="h-px flex-1 bg-slate-200" />
            Cuentas de prueba
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {DEMO_ACCOUNTS.map((acc) => {
              const active = username === acc.username
              return (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => {
                    setUsername(acc.username)
                    setPassword(acc.password)
                    setError(null)
                  }}
                  className={cn(
                    'group rounded-xl border p-3 text-left transition',
                    active
                      ? 'border-brand-300 bg-brand-50/60 ring-2 ring-brand-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-soft',
                  )}
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-brand-700">
                    <acc.icon className="size-3.5" />
                    {acc.label}
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-900">{acc.name}</div>
                  <div className="truncate text-xs text-slate-500">{acc.username}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
