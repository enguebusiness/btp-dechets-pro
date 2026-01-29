// Types pour la base de données Supabase - Bio-Audit / Bio-Shield

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  verification_count: number
  subscription_status: 'free' | 'pro' | 'enterprise' | null
  created_at: string
  updated_at: string
}

export interface Exploitation {
  id: string
  owner_id: string
  name: string
  num_agrement_bio: string | null
  siret: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  telephone: string | null
  email: string | null
  organisme_certificateur: string | null
  date_certification: string | null
  surface_totale: number | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing' | null
  created_at: string
  updated_at: string
}

export interface Parcelle {
  id: string
  exploitation_id: string
  nom: string
  surface: number
  culture_actuelle: string | null
  type_sol: string | null
  irrigation: boolean
  mode_production: 'bio' | 'conversion' | 'conventionnel'
  date_debut_conversion: string | null
  coordonnees_gps: string | null
  created_at: string
  updated_at: string
}

export interface Intrant {
  id: string
  exploitation_id: string
  parcelle_id: string | null
  document_id: string | null
  produit_nom: string
  fournisseur: string | null
  lot_number: string | null
  quantite: number
  unite: string
  date_achat: string
  date_utilisation: string | null
  prix_unitaire: number | null
  prix_total: number | null
  est_bio: boolean
  numero_certificat: string | null
  type_intrant: 'semence' | 'engrais' | 'phytosanitaire' | 'amendement' | 'autre'
  conformite_status: 'conforme' | 'attention' | 'non_conforme' | null
  conformite_details: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Recolte {
  id: string
  exploitation_id: string
  parcelle_id: string
  culture: string
  variete: string | null
  date_recolte: string
  quantite: number
  unite: string
  rendement: number | null
  qualite: string | null
  destination: string | null
  prix_vente: number | null
  acheteur: string | null
  numero_lot_sortie: string | null
  certifie_bio: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CertificatFournisseur {
  id: string
  exploitation_id: string
  fournisseur_nom: string
  numero_certificat: string | null
  organisme_certificateur: string | null
  date_emission: string | null
  date_expiration: string
  produits_couverts: string[]
  storage_path: string | null
  statut: 'valide' | 'expire' | 'a_renouveler'
  created_at: string
  updated_at: string
}

export interface DocumentStorage {
  id: string
  exploitation_id: string
  user_id: string
  nom_fichier: string
  type_doc: 'facture' | 'certificat' | 'bon_livraison' | 'analyse' | 'autre'
  storage_path: string
  taille: number
  mime_type: string
  conservation_jusqu_a: string
  ocr_processed: boolean
  ocr_data: OcrData | null
  ocr_validated: boolean
  validation_date: string | null
  intrants_extraits: IntrantExtrait[]
  certificat_fournisseur_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface OcrData {
  fournisseur: string | null
  numero_facture: string | null
  date_facture: string | null
  total_ht: number | null
  total_ttc: number | null
  lignes: LigneFacture[]
  raw_text: string | null
  confidence_score: number | null
}

export interface LigneFacture {
  id: string
  description: string
  quantite: number | null
  unite: string | null
  prix_unitaire: number | null
  prix_total: number | null
  tva: number | null
  reference: string | null
  is_bio: boolean | null
  numero_lot: string | null
  conformite_status: 'conforme' | 'attention' | 'non_conforme' | null
  conformite_reason: string | null
  confidence: number
}

export interface IntrantExtrait {
  ligne_id: string
  intrant_id: string | null
  status: 'pending' | 'validated' | 'rejected'
  mapped_data: Partial<Intrant>
}

// Types pour les alertes Bio-Shield
export interface AlerteCertificat {
  id: string
  fournisseur: string
  type: 'manquant' | 'expire' | 'expiration_proche'
  message: string
  date_expiration: string | null
  severity: 'warning' | 'critical'
}

export interface ConformiteCheck {
  status: 'conforme' | 'attention' | 'non_conforme'
  reason: string
  details: string[]
  reglement_reference: string | null
}

// Types pour les formulaires et l'UI
export interface ExploitationFormData {
  name: string
  num_agrement_bio?: string
  siret?: string
  adresse?: string
  code_postal?: string
  ville?: string
  telephone?: string
  email?: string
  organisme_certificateur?: string
  date_certification?: string
  surface_totale?: number
}

export interface ParcelleFormData {
  nom: string
  surface: number
  culture_actuelle?: string
  type_sol?: string
  irrigation: boolean
  mode_production: 'bio' | 'conversion' | 'conventionnel'
  date_debut_conversion?: string
  coordonnees_gps?: string
}

export interface IntrantFormData {
  parcelle_id?: string
  produit_nom: string
  fournisseur?: string
  lot_number?: string
  quantite: number
  unite: string
  date_achat: string
  date_utilisation?: string
  prix_unitaire?: number
  prix_total?: number
  est_bio: boolean
  numero_certificat?: string
  type_intrant: 'semence' | 'engrais' | 'phytosanitaire' | 'amendement' | 'autre'
  notes?: string
}

// Types pour les statistiques du bilan matière
export interface BilanMatiere {
  periode: {
    debut: string
    fin: string
  }
  entrees: {
    par_type: Record<string, number>
    par_parcelle: Record<string, number>
    total_kg: number
    total_valeur: number
  }
  sorties: {
    par_culture: Record<string, number>
    par_destination: Record<string, number>
    total_kg: number
    total_valeur: number
  }
  stock_theorique: number
  conformite_bio: {
    pourcentage: number
    alertes: string[]
    intrants_non_conformes: number
  }
}

// Types pour Stripe
export interface StripeSubscription {
  id: string
  status: string
  current_period_start: number
  current_period_end: number
  cancel_at_period_end: boolean
  plan: {
    id: string
    nickname: string
    amount: number
    interval: string
  }
}

export interface CheckoutSession {
  sessionId: string
  url: string
}

// Types pour les réponses API
export interface ApiResponse<T> {
  data: T | null
  error: string | null
  success: boolean
}

// Types pour le Pack Audit
export interface PackAudit {
  exploitation: Exploitation
  periode: { debut: string; fin: string }
  documents: DocumentStorage[]
  certificats: CertificatFournisseur[]
  intrants: Intrant[]
  alertes: AlerteCertificat[]
  conformite_globale: number
}
