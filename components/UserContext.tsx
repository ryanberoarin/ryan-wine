'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@/lib/auth'

type UserContextType = {
  user: User | null
  setUser: (user: User | null) => void
  loading: boolean
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  loading: true,
})

function getStoredUser(): User | null {
  try {
    const cached = localStorage.getItem('wine_club_user')
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = getStoredUser()
    if (!stored) { setLoading(false); return }

    // localStorage로 즉시 렌더링
    setUser(stored)
    setLoading(false)

    // DB 검증은 백그라운드 (삭제된 계정 감지)
    ;(async () => {
      try {
        const { data } = await supabase.from('users').select('*').eq('id', stored.id).maybeSingle()
        if (data) {
          setUser(data as User)
          localStorage.setItem('wine_club_user', JSON.stringify(data))
        } else {
          localStorage.removeItem('wine_club_user')
          localStorage.removeItem('wine_club_device_token')
          window.location.href = '/login'
        }
      } catch {}
    })()
  }, [])

  return (
    <UserContext.Provider value={{ user, setUser, loading }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
