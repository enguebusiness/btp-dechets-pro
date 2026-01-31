import { NextRequest, NextResponse } from 'next/server'
import { getStripe, getPriceId, PLANS, getBaseUrl, type PlanType } from '@/lib/stripe'
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
    const { exploitationId, plan = 'monthly' } = body as {
      exploitationId: string
      plan?: PlanType
    }

    if (!exploitationId) {
      return NextResponse.json(
        { error: 'ID exploitation requis' },
        { status: 400 }
      )
    }

    // Valider le plan
    if (!PLANS[plan]) {
      return NextResponse.json(
        { error: 'Plan invalide. Utilisez "monthly" ou "yearly"' },
        { status: 400 }
      )
    }

    // Vérifier que l'exploitation appartient à l'utilisateur
    const { data: exploitation, error: exploitationError } = await supabase
      .from('exploitations')
      .select('*')
      .eq('id', exploitationId)
      .eq('owner_id', user.id)
      .single()

    if (exploitationError || !exploitation) {
      return NextResponse.json(
        { error: 'Exploitation non trouvée' },
        { status: 404 }
      )
    }

    // Créer ou récupérer le customer Stripe
    let customerId = exploitation.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
          exploitation_id: exploitationId,
        },
        name: exploitation.name,
      })
      customerId = customer.id

      // Sauvegarder le customer ID
      await supabase
        .from('exploitations')
        .update({ stripe_customer_id: customerId })
        .eq('id', exploitationId)
    }

    // Obtenir le price ID pour le plan choisi
    let priceId: string
    try {
      priceId = getPriceId(plan)
    } catch {
      return NextResponse.json(
        { error: `Configuration Stripe incomplète pour le plan ${plan}` },
        { status: 500 }
      )
    }

    const baseUrl = getBaseUrl()
    const planConfig = PLANS[plan]

    // Créer la session de checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard/settings?tab=abonnement&success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/settings?tab=abonnement&canceled=true`,
      metadata: {
        exploitation_id: exploitationId,
        user_id: user.id,
        plan: plan,
      },
      subscription_data: {
        metadata: {
          exploitation_id: exploitationId,
          user_id: user.id,
          plan: plan,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      locale: 'fr',
    })

    if (!session.url) {
      return NextResponse.json(
        { error: 'Erreur création session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      plan: planConfig,
    })
  } catch (error) {
    console.error('Erreur création checkout:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    )
  }
}

// Endpoint GET pour récupérer les plans disponibles
export async function GET() {
  return NextResponse.json({
    plans: PLANS,
    currency: 'EUR',
  })
}
