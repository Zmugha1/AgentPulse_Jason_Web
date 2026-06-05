// Icons: lucide-react — small tree-shakeable set, consistent with modern React nav patterns.
import {
  BarChart3,
  LayoutDashboard,
  Menu,
  Plug,
  Sun,
  UserCircle,
  Users,
  X,
} from 'lucide-react'
import type { AppTab } from '../lib/navigation'

type NavItem = {
  id: AppTab
  label: string
  icon: typeof Sun
}

const NAV_ITEMS: NavItem[] = [
  { id: 'brief', label: 'Morning Brief', icon: Sun },
  { id: 'intelligence', label: 'Lead Intelligence', icon: Users },
  { id: 'market', label: 'Market Intel', icon: BarChart3 },
  { id: 'agentpulse', label: 'My AgentPulse', icon: UserCircle },
  { id: 'integrations', label: 'Integrations', icon: Plug },
]

type SidebarProps = {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  userEmail: string
  onSignOut: () => void
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
}

export default function Sidebar({
  activeTab,
  onTabChange,
  userEmail,
  onSignOut,
  mobileOpen,
  onMobileOpenChange,
}: SidebarProps) {
  function selectTab(tab: AppTab) {
    onTabChange(tab)
    onMobileOpenChange(false)
  }

  return (
    <>
      {/* Mobile hamburger — visible when sidebar closed */}
      {!mobileOpen ? (
        <button
          type="button"
          onClick={() => onMobileOpenChange(true)}
          className="md:hidden fixed top-3 left-3 z-30 flex items-center justify-center w-11 h-11 rounded-lg bg-navy text-white border border-mint/30 shadow-sm"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" aria-hidden />
        </button>
      ) : null}

      {/* Mobile backdrop */}
      {mobileOpen ? (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-40 bg-navy/50"
          aria-label="Close navigation menu"
          onClick={() => onMobileOpenChange(false)}
        />
      ) : null}

      <aside
        className={`
          flex flex-col w-60 shrink-0 bg-navy text-white h-full
          md:relative md:translate-x-0 md:z-auto
          fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        aria-label="Main navigation"
      >
        <div className="px-4 py-5 border-b border-white/10 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <LayoutDashboard className="w-6 h-6 text-teal shrink-0" aria-hidden />
            <h1 className="font-heading text-xl text-white truncate">
              AgentPulse
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onMobileOpenChange(false)}
            className="md:hidden p-1 rounded text-mint hover:text-white"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-r-md text-left font-body text-sm transition-colors cursor-pointer
                  border-l-4 min-h-[44px]
                  ${
                    active
                      ? 'border-teal bg-white/10 text-white font-semibold'
                      : 'border-transparent text-mint/90 hover:bg-teal/20 hover:text-white'
                  }
                `}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto px-4 py-4 border-t border-white/10 space-y-3">
          <p className="font-body text-xs text-slate truncate" title={userEmail}>
            {userEmail}
          </p>
          <button
            type="button"
            onClick={onSignOut}
            className="font-body w-full text-sm text-teal border border-teal/60 rounded px-3 py-2 min-h-[44px] hover:bg-teal/20 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
