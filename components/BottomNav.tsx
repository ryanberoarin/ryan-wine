'use client'

import Link from 'next/link'
import { useUser } from '@/components/UserContext'

type NavItem = { href: string; icon: string; label: string; adminOnly?: boolean }

const navItems: NavItem[] = [
  { href: '/home',     icon: '🏠', label: '홈' },
  { href: '/scan',     icon: '📷', label: '스캔',   adminOnly: true },
  { href: '/sessions', icon: '🥂', label: '모임' },
  { href: '/wines',    icon: '🍷', label: '와인' },
  { href: '/profile',  icon: '👤', label: '내 기록' },
]

export default function BottomNav({ pathname }: { pathname: string }) {
  const { user } = useUser()
  const visible = navItems.filter((item) => !item.adminOnly || user?.is_admin)

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border z-50">
      <div className="flex">
        {visible.map((item) => {
          const isActive = item.href === '/home'
            ? pathname === '/home' || pathname === '/'
            : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
