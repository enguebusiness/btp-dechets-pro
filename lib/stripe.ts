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

// Prix de l'abonnement Pro
export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || ''

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
