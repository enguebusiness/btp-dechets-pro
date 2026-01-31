// Types pour la base de données Supabase - Bio-Audit / Bouclier de Conformité

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  // Colonnes existantes dans Supabase
  verification_count: number
  last_verification_reset: string | null
  scan_limit: number // Valeur par defaut 5, ajoutee par migration
  subscription_status: 'inactive' | 'active' | 'pro' | 'enterprise' | null
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
  // Bouclier de Conformité
  agence_bio_verified: boolean
  agence_bio_id: string | null
  date_verif_agence_bio: string | null
  score_securite: number
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  exploitation_id: string
  nom: string
  siren: string | null
  siret: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  statut_bio: 'certifie' | 'en_conversion' | 'non_certifie' | 'inconnu'
  numero_bio: string | null
  organisme_certificateur: string | null
  date_certification: string | null
  date_expiration_certificat: string | null
  agence_bio_id: string | null
  agence_bio_verified: boolean
  date_derniere_verif: string | null
  url_certificat: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Intrant {
  id: string
  exploitation_id: string
  parcelle_id: string | null
  document_id: string | null
  supplier_id: string | null
  source_document_id: string | null
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
  score_conformite: number | null
  note_ia: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CertificatFournisseur {
  id: string
  exploitation_id: string
  supplier_id: string | null
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
  supplier_id: string | null
  // Colonnes reelles de la table documents_storage dans Supabase
  file_name: string // Colonne reelle (pas nom_fichier)
  type_doc: string // 'facture' | 'certificat' | etc.
  date_document: string // Date du document
  storage_path: string
  conservation_jusqu_a: string
  statut: 'A_VERIFIER' | 'VERIFIE' | 'ARCHIVE'
  siren_fournisseur: string | null
  ocr_processed: boolean
  ocr_data: OcrData | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  exploitation_id: string
  type: 'verification_agence_bio' | 'scan_facture' | 'verification_fournisseur' | 'alerte_conformite' | 'pack_audit_genere'
  entite_type: 'exploitation' | 'supplier' | 'intrant' | 'document' | null
  entite_id: string | null
  action: string
  details: Record<string, unknown> | null
  resultat: 'succes' | 'echec' | 'attention' | null
  created_at: string
}

export interface OcrData {
  fournisseur: string | null
  siren_fournisseur: string | null
  siret_fournisseur: string | null
  numero_facture: string | null
  date_facture: string | null
  total_ht: number | null
  total_ttc: number | null
  lignes: LigneFacture[]
  raw_text: string | null
  confidence_score: number | null
  // Résultat vérification fournisseur
  verification_fournisseur: SupplierVerification | null
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
  // Analyse de conformité IA
  conformite_status: 'conforme' | 'attention' | 'non_conforme' | null
  conformite_reason: string | null
  score_conformite: number | null
  analyse_ia: AnalyseConformiteIA | null
  confidence: number
}

export interface AnalyseConformiteIA {
  status: 'conforme' | 'attention' | 'non_conforme'
  score: number // 0-100
  raisons: string[]
  recommandations: string[]
  reglements_references: string[]
}

export interface SupplierVerification {
  found: boolean
  agence_bio_id: string | null
  nom_officiel: string | null
  statut_bio: 'certifie' | 'en_conversion' | 'non_certifie' | 'inconnu'
  numero_bio: string | null
  organisme_certificateur: string | null
  date_certification: string | null
  activites: string[]
  url_fiche: string | null
  date_verification: string
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
  supplier_id?: string
  type: 'manquant' | 'expire' | 'expiration_proche' | 'non_verifie'
  message: string
  date_expiration: string | null
  severity: 'warning' | 'critical' | 'info'
}

export interface AlerteConformite {
  id: string
  type: 'intrant_non_conforme' | 'fournisseur_non_certifie' | 'certificat_expire' | 'exploitation_non_verifiee'
  entite_type: 'intrant' | 'supplier' | 'certificat' | 'exploitation'
  entite_id: string
  message: string
  severity: 'warning' | 'critical'
  details: Record<string, unknown>
  created_at: string
}

export interface ConformiteCheck {
  status: 'conforme' | 'attention' | 'non_conforme'
  reason: string
  details: string[]
  reglement_reference: string | null
}

// Score de Sécurité
export interface ScoreSecurite {
  global: number // 0-100
  details: {
    exploitation_verifiee: { score: number; max: number; status: boolean }
    intrants_conformes: { score: number; max: number; ratio: string }
    fournisseurs_certifies: { score: number; max: number; ratio: string }
    certificats_valides: { score: number; max: number; ratio: string }
  }
  alertes: AlerteConformite[]
  recommandations: string[]
  derniere_maj: string
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

export interface SupplierFormData {
  nom: string
  siren?: string
  siret?: string
  adresse?: string
  code_postal?: string
  ville?: string
  statut_bio?: 'certifie' | 'en_conversion' | 'non_certifie' | 'inconnu'
  numero_bio?: string
  organisme_certificateur?: string
  notes?: string
}

export interface IntrantFormData {
  parcelle_id?: string
  supplier_id?: string
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

// Types pour le bilan (simplifié pour le pivot)
export interface BilanConformite {
  periode: {
    debut: string
    fin: string
  }
  intrants: {
    total: number
    conformes: number
    attention: number
    non_conformes: number
    non_evalues: number
  }
  fournisseurs: {
    total: number
    certifies: number
    non_certifies: number
    en_conversion: number
  }
  certificats: {
    total: number
    valides: number
    expires: number
    a_renouveler: number
  }
  score_global: number
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
  suppliers: Supplier[]
  intrants: Intrant[]
  alertes: AlerteConformite[]
  score_securite: ScoreSecurite
  genere_le: string
}

// Types pour la vérification Agence Bio
export interface AgenceBioSearchResult {
  id: string
  nom: string
  siret: string | null
  siren: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  numero_bio: string | null
  statut: 'certifie' | 'en_conversion' | 'non_certifie'
  organisme_certificateur: string | null
  activites: string[]
  url_fiche: string
}

export interface AgenceBioVerificationResult {
  success: boolean
  found: boolean
  results: AgenceBioSearchResult[]
  error: string | null
}
