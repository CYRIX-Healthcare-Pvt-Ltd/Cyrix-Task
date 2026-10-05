import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { BarChart3, Grid2x2, ListChecks, LogOut, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { monthGrid, monthOf, today, useMe, useTasks } from '@/lib/tasks'
import { TONE_TEXT, type Tone } from '@/lib/tones'
import { Logo } from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'
import Avatar from '@/components/Avatar'
import Toaster from '@/components/Toast'

/** This month's calendar, which is also what each page opens on — so the badges and the page share one read. */
export function thisMonthRange() {
  const grid = monthGrid(monthOf(today()))
  return { from: grid[0], to: grid[grid.length - 1] }
}

/**
 * The frame every My Task screen sits in — KPI's header, part for part, as
 * in every module: the chrome is common and only the tabs differ.
 */
export default function Shell() {
  const { employee, signOut } = useAuth()
  const { data: me } = useMe()
  const range = thisMonthRange()
  const { data: mine } = useTasks(range)
  const manages = (me?.team ?? 0) > 0
  const { data: team } = useTasks(range, { team: true }, manages)

  // A badge is always somebody waiting on you: a reminder, a comment or a task sent back to you; a task waiting for your approval.
  const forMe = (mine ?? []).filter(t => (t.unseen_kinds ?? []).some(k => k !== 'approved')).length
  const toApprove = (team ?? []).filter(t => t.status === 'done').length

  const items: Array<{ to: string; label: string; short: string; icon: typeof ListChecks; tone: Tone; end?: boolean; badge?: number }> = [
    // The user, 5 Oct: "first tab dashboard then my task".
    { to: '/', label: 'Dashboard', short: 'Dashboard', icon: BarChart3, tone: 'violet', end: true },
    { to: '/my-task', label: 'My Task', short: 'My Task', icon: ListChecks, tone: 'sky', badge: forMe },
    ...(manages ? [{ to: '/team', label: 'My Team Task', short: 'Team Task', icon: Users, tone: 'teal' as Tone, badge: toApprove }] : []),
  ]

  const handleSignOut = async () => {
    await signOut()
    // The portal owns the session: the way back is its door.
    window.location.assign('/')
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:h-16">
          <a href="/" className="btn-press flex shrink-0 items-center gap-2.5 rounded-lg py-1 pr-1" aria-label="All Cyrix modules" title="All Cyrix modules">
            <Logo className="h-9 sm:h-11" />
          </a>
          <div className="relative ml-6 hidden min-w-0 flex-1 lg:block">
            <nav className="nav-scroll flex items-center gap-1 overflow-x-auto">
              {items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                  <item.icon className={clsx('h-4 w-4', TONE_TEXT[item.tone])} />
                  {item.label}
                  <Badge count={item.badge} />
                </NavLink>
              ))}
              <a href="/" className="nav-link" title="All Cyrix modules">
                <Grid2x2 className="h-4 w-4 text-ink-400" />
                Modules
              </a>
            </nav>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            <div className="flex items-center gap-3 rounded-lg py-1 pl-2 pr-1">
              <span className="hidden text-right lg:block">
                <span className="block text-sm font-medium leading-tight text-ink-900">{employee?.full_name}</span>
                <span className="block text-xs leading-tight text-ink-500">{employee?.ecode}</span>
              </span>
              <Avatar name={employee?.full_name} src={employee?.avatar} size="header" />
            </div>
            <ThemeToggle />
            <button onClick={handleSignOut} className="btn-icon" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4.5 w-4.5 text-cyrixRed-600" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-28 lg:pb-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-surface lg:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => clsx(
                'relative flex min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-[color:var(--page-strong)]' : 'text-ink-400',
              )}
            >
              <span className="relative">
                <item.icon className={clsx('h-5 w-5', TONE_TEXT[item.tone])} />
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyrixRed-600 px-1 text-[10px] font-bold text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center">{item.short}</span>
            </NavLink>
          ))}
          <a href="/" className="relative flex min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium text-ink-400 transition-colors">
            <span className="relative"><Grid2x2 className="h-5 w-5" /></span>
            <span className="w-full truncate text-center">Modules</span>
          </a>
        </div>
      </nav>

      <Toaster />
    </div>
  )
}

/** Red because a badge here always means somebody is waiting on you. */
function Badge({ count }: { count?: number }) {
  if (!count || count <= 0) return null
  return (
    <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyrixRed-600 px-1.5 text-[11px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}
