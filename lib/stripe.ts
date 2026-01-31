import Stripe from 'stripe'

// Créer l'instance Stripe uniquement si la clé est disponible
// Pendant le build, la clé peut ne pas être définie
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    })
  : null

export function getStripe(): Stripe {
  if (!stripe) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  return stripe
}

// =============================================================================
// CONFIGURATION DES PRIX BIO-AUDIT
// =============================================================================

// Prix mensuel: 20€/mois
export const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY || ''

// Prix annuel: 200€/an (économie de 40€ soit 2 mois gratuits)
export const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY || ''

// Ancien nom (rétrocompatibilité)
export const PRO_PRICE_ID = PRICE_MONTHLY

// Configuration des plans
export const PLANS = {
  monthly: {
    id: 'pro_monthly',
    name: 'Bio-Audit Premium Mensuel',
    price: 20,
    currency: 'EUR',
    interval: 'month' as const,
    priceId: PRICE_MONTHLY,
    features: [
      'Scans illimités de factures',
      'Vérification automatique Agence Bio',
      'Export Pack Audit PDF',
      'Alertes certificats expirés',
      'Support prioritaire',
    ],
  },
  yearly: {
    id: 'pro_yearly',
    name: 'Bio-Audit Premium Annuel',
    price: 200,
    currency: 'EUR',
    interval: 'year' as const,
    priceId: PRICE_YEARLY,
    features: [
      'Scans illimités de factures',
      'Vérification automatique Agence Bio',
      'Export Pack Audit PDF',
      'Alertes certificats expirés',
      'Support prioritaire',
      '2 mois gratuits (économie de 40€)',
    ],
    savings: 40,
  },
} as const

export type PlanType = keyof typeof PLANS

// Obtenir le price ID selon le plan
export function getPriceId(plan: PlanType): string {
  const planConfig = PLANS[plan]
  if (!planConfig.priceId) {
    throw new Error(`Price ID not configured for plan: ${plan}`)
  }
  return planConfig.priceId
}

// URL de base pour les redirections
export const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
}

// Vérifier si Stripe est configuré
export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    (PRICE_MONTHLY || PRICE_YEARLY)
  )
}
