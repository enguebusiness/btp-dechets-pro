import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET: Obtenir l'usage actuel de l'utilisateur
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifie' },
        { status: 401 }
      )
    }

    // Recuperer le profil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_status, scan_count_month, scan_month_ref, scan_limit')
      .eq('id', user.id)
      .single()

    if (profileError) {
      // Si les colonnes n'existent pas encore, retourner des valeurs par defaut
      if (profileError.code === '42703') {
        return NextResponse.json({
          success: true,
          scan_count: 0,
          scan_limit: 5,
          remaining: 5,
          is_premium: false,
          subscription_status: 'free',
          month: new Date().toISOString().substring(0, 7),
        })
      }
      console.error('Erreur profil:', profileError)
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    const currentMonth = new Date().toISOString().substring(0, 7) // YYYY-MM
    let scanCount = profile?.scan_count_month || 0

    // Reset si nouveau mois
    if (profile?.scan_month_ref !== currentMonth) {
      scanCount = 0
    }

    const isPremium = profile?.subscription_status === 'pro' || profile?.subscription_status === 'enterprise'
    const scanLimit = isPremium ? 999999 : (profile?.scan_limit || 5)
    const remaining = Math.max(0, scanLimit - scanCount)

    return NextResponse.json({
      success: true,
      scan_count: scanCount,
      scan_limit: scanLimit,
      remaining,
      is_premium: isPremium,
      subscription_status: profile?.subscription_status || 'free',
      month: currentMonth,
    })
  } catch (error) {
    console.error('Erreur API usage:', error)
    return NextResponse.json(
      { error: 'Erreur interne' },
      { status: 500 }
    )
  }
}

// POST: Incrementer le compteur de scans (appele avant chaque scan)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifie' },
        { status: 401 }
      )
    }

    const currentMonth = new Date().toISOString().substring(0, 7)

    // Recuperer le profil actuel
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_status, scan_count_month, scan_month_ref, scan_limit')
      .eq('id', user.id)
      .single()

    if (profileError && profileError.code !== '42703') {
      console.error('Erreur profil:', profileError)
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    let scanCount = profile?.scan_count_month || 0
    const isPremium = profile?.subscription_status === 'pro' || profile?.subscription_status === 'enterprise'
    const scanLimit = isPremium ? 999999 : (profile?.scan_limit || 5)

    // Reset si nouveau mois
    if (profile?.scan_month_ref !== currentMonth) {
      scanCount = 0
    }

    // Verifier si on peut scanner
    if (scanCount >= scanLimit) {
      return NextResponse.json({
        success: false,
        can_scan: false,
        error: 'Limite de scans atteinte',
        scan_count: scanCount,
        scan_limit: scanLimit,
        remaining: 0,
        is_premium: isPremium,
        upgrade_url: '/dashboard/settings?tab=abonnement',
      }, { status: 403 })
    }

    // Incrementer le compteur
    const newScanCount = scanCount + 1
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        scan_count_month: newScanCount,
        scan_month_ref: currentMonth,
      })
      .eq('id', user.id)

    if (updateError && updateError.code !== '42703') {
      console.error('Erreur update:', updateError)
      // On continue quand meme - le scan ne doit pas etre bloque par une erreur de comptage
    }

    return NextResponse.json({
      success: true,
      can_scan: true,
      scan_count: newScanCount,
      scan_limit: scanLimit,
      remaining: Math.max(0, scanLimit - newScanCount),
      is_premium: isPremium,
    })
  } catch (error) {
    console.error('Erreur API usage POST:', error)
    // En cas d'erreur, on autorise le scan pour ne pas bloquer l'utilisateur
    return NextResponse.json({
      success: true,
      can_scan: true,
      error: 'Erreur de comptage, scan autorise',
    })
  }
}
