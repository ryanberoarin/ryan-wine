'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useUser } from '@/components/UserContext'
import BottomNav from '@/components/BottomNav'
import type { User } from '@/lib/auth'

export default function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  const { setUser } = useUser()
  const pathname = usePathname()

  const [user] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('wine_club_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (user) {
      setUser(user)
    } else {
      window.location.href = '/login'
    }
  }, [])

  if (!user) return null

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto">
      <main className="flex-1 pb-20 overflow-y-auto">{children}</main>
      <BottomNav pathname={pathname} />
    </div>
  )
}
