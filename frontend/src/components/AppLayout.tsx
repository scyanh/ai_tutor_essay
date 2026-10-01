import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import type { Role } from '../api'
import { useAuth } from '../auth/AuthContext'
import { Avatar, cn, Logo } from './ui'

const ROLE_UI: Record<Role, { home: string; nav: string; label: string }> = {
  admin: { home: '/admin', nav: 'Maestros', label: 'Administrador' },
  teacher: { home: '/maestro', nav: 'Mis grupos', label: 'Maestro' },
  student: { home: '/alumno', nav: 'Mis tareas', label: 'Alumno' },
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  if (!user) return null
  const { home, nav, label } = ROLE_UI[user.role]

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
          <Link to={home}>
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink
              to={home}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900',
                )
              }
            >
              {nav}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2.5 rounded-xl py-1.5 pr-2 pl-1.5 transition hover:bg-slate-100"
              >
                <Avatar name={user.name} id={user.id} size="sm" />
                <div className="hidden text-left leading-tight sm:block">
                  <div className="text-sm font-medium text-slate-900">{user.name}</div>
                  <div className="max-w-[14rem] truncate text-xs text-slate-500">
                    {user.role === 'student' && user.group ? `${label} · ${user.group}` : label}
                  </div>
                </div>
                <ChevronDown className="size-4 text-slate-400" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lift animate-pop">
                  <div className="px-3 py-2.5">
                    <div className="truncate text-sm font-medium text-slate-900">{user.name}</div>
                    <div className="truncate text-xs text-slate-500">{user.email}</div>
                  </div>
                  <div className="my-1 h-px bg-slate-100" />
                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-rose-50 hover:text-rose-700"
                  >
                    <LogOut className="size-4" />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
