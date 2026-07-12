'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useUser } from '@/components/UserContext'
import { getDeviceToken } from '@/lib/auth'
import BottomNav from '@/components/BottomNav'

async function registerPush(deviceToken: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    })

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
  } catch {
    // 푸시 지원 안 되는 환경 무시
  }
}

export default function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login'
    }
  }, [user, loading])

  useEffect(() => {
    if (user) registerPush(getDeviceToken())
  }, [user])

  if (loading || !user) return null

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto">
      <main className="flex-1 pb-20 overflow-y-auto">{children}</main>
      <BottomNav pathname={pathname} />
    </div>
  )
}
