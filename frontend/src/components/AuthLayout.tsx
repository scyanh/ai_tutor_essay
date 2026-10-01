import type { ReactNode } from 'react'
import { ClipboardCheck, MessageSquare, NotebookPen } from 'lucide-react'
import { Logo } from './ui'

const FEATURES = [
  { icon: NotebookPen, title: 'Escribe con guardado automático', text: 'Tu avance se guarda solo, mientras escribes.' },
  { icon: MessageSquare, title: 'Sharon te acompaña', text: 'Una tutora que te guía con preguntas, sin escribir por ti.' },
  { icon: ClipboardCheck, title: 'Entrega y retroalimentación', text: 'Tu maestro califica y te deja comentarios.' },
]

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-brand-500/40 blur-3xl" />
          <div className="absolute right-[-8rem] bottom-[-6rem] size-[26rem] rounded-full bg-fuchsia-500/25 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
            }}
          />
        </div>

        <div className="relative">
          <Logo light />
        </div>

        <div className="relative max-w-lg">
          <p className="font-serif text-[2.6rem] leading-[1.15] text-white">
            Cada gran ensayo empieza con una <em className="text-brand-200">buena pregunta</em>.
          </p>
          <p className="mt-5 text-base leading-relaxed text-brand-100/80">
            Sharon conecta a maestros y alumnos de preparatoria para planear, escribir y revisar ensayos con el
            acompañamiento de una tutora inteligente.
          </p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-100 ring-1 ring-white/15">
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="font-medium text-white">{title}</div>
                  <div className="text-sm text-brand-100/70">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-sm text-brand-200/60">© {new Date().getFullYear()} Sharon · Plataforma educativa</div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
