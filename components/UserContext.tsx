'use client'

import { createContext, useContext, useEffect, useState } from 'react'
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
    // localStorage에서 바로 읽기 (비동기 불필요)
    const stored = getStoredUser()
    setUser(stored)
    setLoading(false)
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
