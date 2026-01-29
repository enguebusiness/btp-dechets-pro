import { createBrowserClient } from '@supabase/ssr'

let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (supabaseInstance) {
    return supabaseInstance
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Durant le build, les variables d'environnement peuvent ne pas être disponibles
  // On utilise des valeurs par défaut pour permettre le build
  if (!url || !key) {
    if (typeof window === 'undefined') {
      // Côté serveur pendant le build - utiliser des valeurs placeholder
      return createBrowserClient(
        'https://placeholder.supabase.co',
        'placeholder-anon-key'
      )
    }
    throw new Error('Missing Supabase environment variables')
  }

  supabaseInstance = createBrowserClient(url, key)
  return supabaseInstance
}
