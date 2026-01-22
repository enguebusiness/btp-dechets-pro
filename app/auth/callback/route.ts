import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import type { AuthOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (code) {
    const supabase = createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  if (token_hash && type) {
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as AuthOtpType,
    })
    if (error) {
      return NextResponse.redirect(new URL('/auth/login?error=invalid_link', request.url))
    }
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
