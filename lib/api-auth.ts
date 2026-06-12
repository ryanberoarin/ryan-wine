import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { User } from './supabase'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getAuthUser(req: NextRequest): Promise<User | null> {
  const token = req.headers.get('x-device-token')
  if (!token) return null
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('device_token', token)
    .eq('is_active', true)
    .maybeSingle()
  return (data as User) ?? null
}
