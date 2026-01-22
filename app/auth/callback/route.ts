import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type) {
    const supabase = createClient()
    
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email',
    })
    
    if (error) {
      console.error('Auth error:', error)
      return NextResponse.redirect(new URL('/auth/login?error=invalid_link', request.url))
    }
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
