import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  console.log('🔍 Supabase URL:', url)
  console.log('🔍 Supabase Key:', key?.substring(0, 20) + '...')
  
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }
  
  return createBrowserClient(url, key)
}
