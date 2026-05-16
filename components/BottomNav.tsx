'use client'

import Link from 'next/link'

type NavItem = {
  href: string
  icon: string
  label: string
}

const navItems: NavItem[] = [
  { href: '/home', icon: '🏠', label: '홈' },
  { href: '/scan', icon: '📷', label: '스캔' },
  { href: '/sessions', icon: '🥂', label: '모임' },
  { href: '/profile', icon: '👤', label: '내 기록' },
]

export default function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border z-50">
      <div className="flex">
        {navItems.map((item) => {
          const isActive = item.href === '/home' ? pathname === '/home' || pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
