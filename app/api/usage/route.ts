import { NextResponse } from 'next/server'
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

    // Recuperer le profil avec les colonnes existantes
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_status, verification_count, last_verification_reset, scan_limit')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Erreur profil:', profileError)
      // Retourner des valeurs par defaut
      return NextResponse.json({
        success: true,
        scan_count: 0,
        scan_limit: 5,
        remaining: 5,
        is_premium: false,
        subscription_status: 'inactive',
        month: new Date().toISOString().substring(0, 7),
      })
    }

    // Calculer le debut du mois courant
    const currentMonth = new Date()
    currentMonth.setDate(1)
    currentMonth.setHours(0, 0, 0, 0)

    let scanCount = profile?.verification_count || 0

    // Reset si nouveau mois
    const lastReset = profile?.last_verification_reset
      ? new Date(profile.last_verification_reset)
      : null

    if (!lastReset || lastReset < currentMonth) {
      scanCount = 0
    }

    const isPremium = profile?.subscription_status === 'active' ||
                      profile?.subscription_status === 'pro' ||
                      profile?.subscription_status === 'enterprise'
    const scanLimit = isPremium ? 999999 : (profile?.scan_limit || 5)
    const remaining = Math.max(0, scanLimit - scanCount)

    return NextResponse.json({
      success: true,
      scan_count: scanCount,
      scan_limit: scanLimit,
      remaining,
      is_premium: isPremium,
      subscription_status: profile?.subscription_status || 'inactive',
      month: new Date().toISOString().substring(0, 7),
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
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifie' },
        { status: 401 }
      )
    }

    const currentMonth = new Date()
    currentMonth.setDate(1)
    currentMonth.setHours(0, 0, 0, 0)

    // Recuperer le profil actuel
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_status, verification_count, last_verification_reset, scan_limit')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Erreur profil:', profileError)
      return NextResponse.json({
        success: true,
        can_scan: true,
        error: 'Erreur de comptage, scan autorise',
      })
    }

    let scanCount = profile?.verification_count || 0
    const isPremium = profile?.subscription_status === 'active' ||
                      profile?.subscription_status === 'pro' ||
                      profile?.subscription_status === 'enterprise'
    const scanLimit = isPremium ? 999999 : (profile?.scan_limit || 5)

    // Reset si nouveau mois
    const lastReset = profile?.last_verification_reset
      ? new Date(profile.last_verification_reset)
      : null

    if (!lastReset || lastReset < currentMonth) {
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
        verification_count: newScanCount,
        last_verification_reset: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Erreur update:', updateError)
      // On continue quand meme
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
    return NextResponse.json({
      success: true,
      can_scan: true,
      error: 'Erreur de comptage, scan autorise',
    })
  }
}
