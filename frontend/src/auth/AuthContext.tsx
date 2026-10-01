import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, type AuthResult, type RegisterInput, type User } from '../api'

const STORAGE_KEY = 'sharon.session'

interface AuthState {
  user: User | null
  token: string | null
  ready: boolean
  login: (username: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  refreshUser: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken)
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!token)

  useEffect(() => {
    if (!token || user) return
    let cancelled = false
    api
      .me(token)
      .then((u) => !cancelled && setUser(u))
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          localStorage.removeItem(STORAGE_KEY)
          setToken(null)
        }
      })
      .finally(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [token, user])

  const startSession = useCallback((result: AuthResult) => {
    localStorage.setItem(STORAGE_KEY, result.token)
    setToken(result.token)
    setUser(result.user)
    setReady(true)
    return result.user
  }, [])

  const login = useCallback(
    async (username: string, password: string) => startSession(await api.login(username, password)),
    [startSession],
  )

  const register = useCallback(
    async (input: RegisterInput) => startSession(await api.register(input)),
    [startSession],
  )

  const refreshUser = useCallback(async () => {
    if (token) setUser(await api.me(token))
  }, [token])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, token, ready, login, register, refreshUser, logout }),
    [user, token, ready, login, register, refreshUser, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

export function useToken(): string {
  const { token } = useAuth()
  if (!token) throw new Error('Sin sesión activa')
  return token
}
