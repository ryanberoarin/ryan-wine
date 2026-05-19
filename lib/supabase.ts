import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type User = {
  id: string
  nickname: string
  device_token: string
  is_admin: boolean
  is_active: boolean
  created_at: string
}

export type Wine = {
  id: string
  name: string
  producer: string | null
  region: string | null
  country: string | null
  vintage: number | null
  grape_varieties: string[] | null
  wine_type: 'red' | 'white' | 'orange' | 'rose' | 'sparkling' | 'other' | null
  is_natural: boolean
  label_image_url: string | null
  ai_description: string | null
  created_by: string | null
  created_at: string
}

export type TastingNote = {
  id: string
  wine_id: string
  user_id: string
  session_id: string | null
  rating: number | null
  aroma_keywords: string[] | null
  taste_keywords: string[] | null
  texture_keywords: string[] | null
  memo: string | null
  created_at: string
  wine?: Wine
  user?: User
}

export type Session = {
  id: string
  title: string
  description: string | null
  venue: string | null
  scheduled_at: string | null
  rsvp_deadline: string | null
  status: 'planning' | 'active' | 'completed'
  total_cost: number | null
  subsidy_carryover: number | null
  settlement_published: boolean
  created_by: string | null
  created_at: string
}

export type SessionRsvp = {
  id: string
  session_id: string
  user_id: string
  status: 'attending' | 'not_attending'
  created_at: string
  user?: User
}

export type SessionPenalty = {
  id: string
  session_id: string
  user_id: string
  amount: number
  reason: string
  created_at: string
  user?: User
}

export type CostItem = {
  id: string
  session_id: string
  round_number: number
  category: 'wine' | 'venue' | 'taxi' | 'food' | 'other'
  description: string | null
  amount: number
  created_at: string
}

export type SessionWine = {
  id: string
  session_id: string
  wine_id: string
  added_by: string | null
  order_index: number
  status: 'proposed' | 'confirmed' | 'removed'
  created_at: string
  wine?: Wine
  user?: User
}

export type Message = {
  id: string
  session_id: string
  user_id: string | null
  message_type: 'text' | 'tasting_note' | 'wine_card'
  content: string
  wine_id: string | null
  tasting_note_id: string | null
  created_at: string
  user?: User
  wine?: Wine
  tasting_note?: TastingNote
}
