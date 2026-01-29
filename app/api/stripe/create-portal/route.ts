import { NextRequest, NextResponse } from 'next/server'
import { getStripe, getBaseUrl } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe()
    const supabase = await createServerSupabaseClient()

    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { exploitationId } = body

    if (!exploitationId) {
      return NextResponse.json(
        { error: 'ID exploitation requis' },
        { status: 400 }
      )
    }

    // Récupérer l'exploitation
    const { data: exploitation, error: exploitationError } = await supabase
      .from('exploitations')
      .select('stripe_customer_id')
      .eq('id', exploitationId)
      .eq('owner_id', user.id)
      .single()

    if (exploitationError || !exploitation) {
      return NextResponse.json(
        { error: 'Exploitation non trouvée' },
        { status: 404 }
      )
    }

    if (!exploitation.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Aucun abonnement actif' },
        { status: 400 }
      )
    }

    const baseUrl = getBaseUrl()

    // Créer la session du portail client
    const session = await stripe.billingPortal.sessions.create({
      customer: exploitation.stripe_customer_id,
      return_url: `${baseUrl}/dashboard/settings?tab=abonnement`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Erreur création portail:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    )
  }
}
