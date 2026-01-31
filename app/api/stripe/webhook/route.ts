import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase-server'
import Stripe from 'stripe'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe()
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature || !webhookSecret) {
      console.error('Missing signature or webhook secret')
      return NextResponse.json(
        { error: 'Configuration invalide' },
        { status: 400 }
      )
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json(
        { error: 'Signature invalide' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const exploitationId = session.metadata?.exploitation_id
        const userId = session.metadata?.user_id
        const subscriptionId = session.subscription as string

        if (exploitationId && subscriptionId) {
          // Récupérer les détails de l'abonnement
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)

          // Mettre à jour l'exploitation
          await supabase
            .from('exploitations')
            .update({
              stripe_subscription_id: subscriptionId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', exploitationId)

          // Mettre à jour le profil utilisateur
          if (userId) {
            await supabase
              .from('profiles')
              .upsert({
                id: userId,
                subscription_status: subscription.status === 'active' ? 'pro' : 'free',
                verification_count: 0,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'id'
              })
          }

          console.log(`Subscription ${subscriptionId} activated for exploitation ${exploitationId}`)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const exploitationId = subscription.metadata?.exploitation_id
        const userId = subscription.metadata?.user_id

        if (exploitationId) {
          await supabase
            .from('exploitations')
            .update({
              updated_at: new Date().toISOString(),
            })
            .eq('id', exploitationId)
        }

        // Mettre à jour le profil
        if (userId) {
          const status = subscription.status === 'active' ? 'pro' :
                         subscription.status === 'canceled' ? 'free' : 'free'

          await supabase
            .from('profiles')
            .update({
              subscription_status: status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId)
        }

        console.log(`Subscription ${subscription.id} updated: ${subscription.status}`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const exploitationId = subscription.metadata?.exploitation_id
        const userId = subscription.metadata?.user_id

        if (exploitationId) {
          await supabase
            .from('exploitations')
            .update({
              stripe_subscription_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', exploitationId)
        }

        // Réinitialiser le profil
        if (userId) {
          await supabase
            .from('profiles')
            .update({
              subscription_status: 'free',
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId)
        }

        console.log(`Subscription ${subscription.id} deleted for exploitation ${exploitationId}`)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoice.subscription as string

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const userId = subscription.metadata?.user_id

          if (userId) {
            await supabase
              .from('profiles')
              .update({
                subscription_status: 'free',
                updated_at: new Date().toISOString(),
              })
              .eq('id', userId)
          }

          console.log(`Payment failed for subscription ${subscriptionId}`)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Erreur webhook' },
      { status: 500 }
    )
  }
}
