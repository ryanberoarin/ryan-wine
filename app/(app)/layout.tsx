'use client'

import dynamic from 'next/dynamic'

const AuthLayoutClient = dynamic(
  () => import('@/components/AuthLayoutClient'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-pulse">🍷</div>
      </div>
    ),
  }
)

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthLayoutClient>{children}</AuthLayoutClient>
}
