import { GoogleGenerativeAI, Part } from '@google/generative-ai'
import type { OcrData, LigneFacture, ConformiteCheck, AnalyseConformiteIA, SupplierVerification } from '@/types/database'

// Support pour les deux noms de variables d'environnement
const API_KEY = process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY

if (!API_KEY) {
  console.warn('GOOGLE_GENAI_API_KEY ou GOOGLE_GEMINI_API_KEY non définie')
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null

// Utiliser Gemini 2.5 Flash pour de meilleures performances
const MODEL_NAME = 'gemini-2.0-flash'

// Prompt Bio-Shield amélioré pour extraction multi-lignes + SIREN + analyse de conformité
const INVOICE_EXTRACTION_PROMPT = `Tu es un expert en agriculture biologique, en réglementation INAO/Ecocert, et en analyse de factures.
Analyse cette facture et extrais TOUTES les informations avec une attention particulière aux éléments de conformité Bio.

OBJECTIF PRINCIPAL:
1. Extraire CHAQUE ligne de produit (pas seulement la première)
2. Identifier le SIREN/SIRET du fournisseur
3. Évaluer la conformité Bio de chaque produit selon le règlement (UE) 2018/848

Retourne UNIQUEMENT un objet JSON valide (sans markdown, sans backticks, sans texte avant/après):
{
  "fournisseur": "raison sociale complète du fournisseur",
  "siren_fournisseur": "SIREN 9 chiffres si visible",
  "siret_fournisseur": "SIRET 14 chiffres si visible",
  "numero_facture": "numéro de la facture",
  "date_facture": "YYYY-MM-DD",
  "total_ht": 0.00,
  "total_ttc": 0.00,
  "lignes": [
    {
      "id": "ligne_1",
      "description": "nom complet et détaillé du produit",
      "quantite": 0,
      "unite": "kg/L/unité/sac/T/etc",
      "prix_unitaire": 0.00,
      "prix_total": 0.00,
      "tva": 5.5,
      "reference": "code/référence produit",
      "is_bio": true,
      "numero_lot": "numéro de lot si visible",
      "conformite_status": "conforme",
      "conformite_reason": "Produit certifié Bio AB/Ecocert",
      "score_conformite": 95,
      "analyse_ia": {
        "status": "conforme",
        "score": 95,
        "raisons": ["Certification Bio visible", "Fournisseur connu"],
        "recommandations": [],
        "reglements_references": ["Règlement (UE) 2018/848 - Annexe II"]
      },
      "confidence": 0.95
    }
  ],
  "raw_text": "texte brut principal extrait",
  "confidence_score": 0.90
}

RÈGLES D'ANALYSE DE CONFORMITÉ BIO (Règlement UE 2018/848):

🟢 CONFORME (score 80-100):
- Mention "AB", "Agriculture Biologique", "Ecocert", "FR-BIO-XX" visible
- Semences certifiées Bio
- Engrais organiques (fumier, compost, guano)
- Traitements autorisés en Bio (soufre, cuivre, huiles essentielles, Bacillus thuringiensis)
- Produits avec numéro de lot Bio traçable

🟠 ATTENTION (score 40-79):
- Produit conventionnel chez un fournisseur mixte
- Semences sans mention Bio explicite
- Engrais avec origine non précisée
- Produit nécessitant une dérogation INAO
- Mention "issu de l'agriculture biologique" sans certification
- Auxiliaires de culture (pièges, filets) - généralement OK

🔴 NON CONFORME (score 0-39):
- Pesticides de synthèse (glyphosate, deltaméthrine, métam-sodium, chlorpyrifos)
- Engrais de synthèse (ammonitrate, urée, superphosphate, NPK chimique)
- Herbicides chimiques
- Semences OGM ou traitées chimiquement
- Régulateurs de croissance de synthèse
- Produits avec mention "non utilisable en agriculture biologique"

INDICATEURS À RECHERCHER:
- Logo AB (Agriculture Biologique)
- Logo Eurofeuille
- Mention "FR-BIO-XX" (organisme certificateur)
- "Certifié Ecocert" / "Certifié Bureau Veritas"
- "Utilisable en agriculture biologique" (UAB)
- "Conforme au règlement CE 834/2007" ou "UE 2018/848"

EXTRACTION DU SIREN/SIRET:
- Chercher un numéro à 9 chiffres (SIREN) ou 14 chiffres (SIRET)
- Souvent près de "SIRET:", "SIREN:", "RCS", ou "N° TVA"
- Format: XXX XXX XXX ou XXX XXX XXX XXXXX

Extrais ABSOLUMENT TOUTES les lignes produits visibles, même partiellement.`

export interface GeminiOcrResult {
  success: boolean
  data: OcrData | null
  error: string | null
}

// Fonction pour nettoyer et parser la réponse JSON
function parseGeminiResponse(text: string): Record<string, unknown> {
  let cleanedText = text.trim()

  // Enlever les backticks markdown
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.slice(7)
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.slice(3)
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.slice(0, -3)
  }
  cleanedText = cleanedText.trim()

  // Trouver le premier { et le dernier }
  const startIndex = cleanedText.indexOf('{')
  const endIndex = cleanedText.lastIndexOf('}')

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    cleanedText = cleanedText.slice(startIndex, endIndex + 1)
  }

  return JSON.parse(cleanedText)
}

// Fonction pour formater les données OCR
function formatOcrData(parsedData: Record<string, unknown>): OcrData {
  const lignes = (parsedData.lignes as Array<Record<string, unknown>>) || []

  return {
    fournisseur: (parsedData.fournisseur as string) || null,
    siren_fournisseur: (parsedData.siren_fournisseur as string) || null,
    siret_fournisseur: (parsedData.siret_fournisseur as string) || null,
    numero_facture: (parsedData.numero_facture as string) || null,
    date_facture: (parsedData.date_facture as string) || null,
    total_ht: typeof parsedData.total_ht === 'number' ? parsedData.total_ht : null,
    total_ttc: typeof parsedData.total_ttc === 'number' ? parsedData.total_ttc : null,
    lignes: lignes.map((ligne, index): LigneFacture => {
      const analyseIa = ligne.analyse_ia as Record<string, unknown> | null

      return {
        id: (ligne.id as string) || `ligne_${index + 1}`,
        description: (ligne.description as string) || '',
        quantite: typeof ligne.quantite === 'number' ? ligne.quantite : null,
        unite: (ligne.unite as string) || null,
        prix_unitaire: typeof ligne.prix_unitaire === 'number' ? ligne.prix_unitaire : null,
        prix_total: typeof ligne.prix_total === 'number' ? ligne.prix_total : null,
        tva: typeof ligne.tva === 'number' ? ligne.tva : null,
        reference: (ligne.reference as string) || null,
        is_bio: typeof ligne.is_bio === 'boolean' ? ligne.is_bio : null,
        numero_lot: (ligne.numero_lot as string) || null,
        conformite_status: (ligne.conformite_status as 'conforme' | 'attention' | 'non_conforme') || null,
        conformite_reason: (ligne.conformite_reason as string) || null,
        score_conformite: typeof ligne.score_conformite === 'number' ? ligne.score_conformite : null,
        analyse_ia: analyseIa ? {
          status: (analyseIa.status as 'conforme' | 'attention' | 'non_conforme') || 'attention',
          score: typeof analyseIa.score === 'number' ? analyseIa.score : 50,
          raisons: Array.isArray(analyseIa.raisons) ? analyseIa.raisons as string[] : [],
          recommandations: Array.isArray(analyseIa.recommandations) ? analyseIa.recommandations as string[] : [],
          reglements_references: Array.isArray(analyseIa.reglements_references) ? analyseIa.reglements_references as string[] : [],
        } : null,
        confidence: typeof ligne.confidence === 'number' ? ligne.confidence : 0.5,
      }
    }),
    raw_text: (parsedData.raw_text as string) || null,
    confidence_score: typeof parsedData.confidence_score === 'number' ? parsedData.confidence_score : null,
    verification_fournisseur: null, // Sera rempli après vérification Agence Bio
  }
}

export async function analyzeInvoiceWithGemini(
  imageBase64: string,
  mimeType: string
): Promise<GeminiOcrResult> {
  if (!genAI) {
    return {
      success: false,
      data: null,
      error: 'Gemini API non configurée. Vérifiez GOOGLE_GENAI_API_KEY.',
    }
  }

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.1, // Plus déterministe pour l'extraction
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    })

    const imagePart: Part = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    }

    const result = await model.generateContent([INVOICE_EXTRACTION_PROMPT, imagePart])
    const response = result.response
    const text = response.text()

    const parsedData = parseGeminiResponse(text)
    const ocrData = formatOcrData(parsedData)

    return {
      success: true,
      data: ocrData,
      error: null,
    }
  } catch (error) {
    console.error('Erreur Gemini OCR:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Erreur analyse OCR',
    }
  }
}

export async function analyzePdfWithGemini(
  pdfBase64: string
): Promise<GeminiOcrResult> {
  if (!genAI) {
    return {
      success: false,
      data: null,
      error: 'Gemini API non configurée. Vérifiez GOOGLE_GENAI_API_KEY.',
    }
  }

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    })

    const pdfPart: Part = {
      inlineData: {
        data: pdfBase64,
        mimeType: 'application/pdf',
      },
    }

    const result = await model.generateContent([INVOICE_EXTRACTION_PROMPT, pdfPart])
    const response = result.response
    const text = response.text()

    const parsedData = parseGeminiResponse(text)
    const ocrData = formatOcrData(parsedData)

    return {
      success: true,
      data: ocrData,
      error: null,
    }
  } catch (error) {
    console.error('Erreur Gemini PDF OCR:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Erreur analyse PDF',
    }
  }
}

// Analyse de conformité approfondie pour un produit
const CONFORMITE_ANALYSIS_PROMPT = `Tu es un expert certifié INAO en agriculture biologique.
Analyse ce produit et fournis une évaluation détaillée de sa conformité au règlement (UE) 2018/848.

Produit: {PRODUCT_NAME}
Fournisseur: {SUPPLIER}
Marqué Bio: {IS_BIO}
Type de produit supposé: {PRODUCT_TYPE}

Retourne UNIQUEMENT un objet JSON (sans markdown, sans texte avant/après):
{
  "status": "conforme|attention|non_conforme",
  "score": 85,
  "raisons": [
    "Raison 1 de ce statut",
    "Raison 2"
  ],
  "recommandations": [
    "Action recommandée 1",
    "Action recommandée 2"
  ],
  "reglements_references": [
    "Règlement (UE) 2018/848 - Article XX",
    "Annexe II - Partie X"
  ],
  "risques_identifies": [
    "Risque potentiel 1"
  ],
  "alternatives_bio": [
    "Alternative conforme suggérée"
  ]
}

Règles de scoring (0-100):
- 90-100: Certifié Bio, aucun doute
- 70-89: Probablement conforme, vérification recommandée
- 50-69: Dérogation nécessaire ou doute significatif
- 30-49: Forte probabilité de non-conformité
- 0-29: Clairement interdit en Bio`

export async function analyzeProductConformite(
  productName: string,
  supplier: string | null,
  isBio: boolean | null,
  productType: string = 'autre'
): Promise<AnalyseConformiteIA> {
  const defaultResult: AnalyseConformiteIA = {
    status: 'attention',
    score: 50,
    raisons: ['Analyse automatique non disponible'],
    recommandations: ['Vérifier manuellement la conformité du produit'],
    reglements_references: [],
  }

  if (!genAI) {
    return defaultResult
  }

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
    })

    const prompt = CONFORMITE_ANALYSIS_PROMPT
      .replace('{PRODUCT_NAME}', productName)
      .replace('{SUPPLIER}', supplier || 'Non spécifié')
      .replace('{IS_BIO}', isBio === true ? 'Oui' : isBio === false ? 'Non' : 'Non spécifié')
      .replace('{PRODUCT_TYPE}', productType)

    const result = await model.generateContent(prompt)
    const response = result.response
    const text = response.text()

    const parsed = parseGeminiResponse(text)

    return {
      status: (parsed.status as 'conforme' | 'attention' | 'non_conforme') || 'attention',
      score: typeof parsed.score === 'number' ? parsed.score : 50,
      raisons: Array.isArray(parsed.raisons) ? parsed.raisons as string[] : ['Analyse incomplète'],
      recommandations: Array.isArray(parsed.recommandations) ? parsed.recommandations as string[] : [],
      reglements_references: Array.isArray(parsed.reglements_references) ? parsed.reglements_references as string[] : [],
    }
  } catch (error) {
    console.error('Erreur analyse conformité:', error)
    return defaultResult
  }
}

// Vérification simple de conformité (version legacy)
export async function checkProductConformite(
  productName: string,
  supplier: string | null,
  isBio: boolean | null
): Promise<ConformiteCheck> {
  const analysis = await analyzeProductConformite(productName, supplier, isBio)

  return {
    status: analysis.status,
    reason: analysis.raisons[0] || 'Non évalué',
    details: analysis.raisons,
    reglement_reference: analysis.reglements_references[0] || null,
  }
}

// Vérification de certificat fournisseur
export async function checkSupplierCertificate(
  fournisseur: string,
  certificatsExistants: Array<{ fournisseur_nom: string; date_expiration: string; supplier_id?: string }>
): Promise<{
  exists: boolean
  expired: boolean
  expirationDate: string | null
  supplierId: string | null
  message: string
}> {
  const normalizedFournisseur = fournisseur.toLowerCase().trim()

  const matchingCert = certificatsExistants.find(cert =>
    cert.fournisseur_nom.toLowerCase().trim().includes(normalizedFournisseur) ||
    normalizedFournisseur.includes(cert.fournisseur_nom.toLowerCase().trim())
  )

  if (!matchingCert) {
    return {
      exists: false,
      expired: false,
      expirationDate: null,
      supplierId: null,
      message: `Certificat Bio manquant pour ${fournisseur}`,
    }
  }

  const expirationDate = new Date(matchingCert.date_expiration)
  const today = new Date()
  const isExpired = expirationDate < today
  const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let message: string
  if (isExpired) {
    message = `Certificat expiré depuis le ${expirationDate.toLocaleDateString('fr-FR')}`
  } else if (daysUntilExpiration <= 30) {
    message = `Certificat expire dans ${daysUntilExpiration} jours (${expirationDate.toLocaleDateString('fr-FR')})`
  } else {
    message = `Certificat valide jusqu'au ${expirationDate.toLocaleDateString('fr-FR')}`
  }

  return {
    exists: true,
    expired: isExpired,
    expirationDate: matchingCert.date_expiration,
    supplierId: matchingCert.supplier_id || null,
    message,
  }
}

// Calcul du score de conformité global pour une liste d'intrants
export function calculateGlobalConformityScore(
  lignes: LigneFacture[]
): { score: number; breakdown: { conforme: number; attention: number; non_conforme: number } } {
  if (lignes.length === 0) {
    return { score: 100, breakdown: { conforme: 0, attention: 0, non_conforme: 0 } }
  }

  const breakdown = {
    conforme: 0,
    attention: 0,
    non_conforme: 0,
  }

  let totalScore = 0
  let scoredItems = 0

  for (const ligne of lignes) {
    if (ligne.conformite_status === 'conforme') {
      breakdown.conforme++
      totalScore += ligne.score_conformite ?? 90
      scoredItems++
    } else if (ligne.conformite_status === 'attention') {
      breakdown.attention++
      totalScore += ligne.score_conformite ?? 60
      scoredItems++
    } else if (ligne.conformite_status === 'non_conforme') {
      breakdown.non_conforme++
      totalScore += ligne.score_conformite ?? 20
      scoredItems++
    }
  }

  const score = scoredItems > 0 ? Math.round(totalScore / scoredItems) : 100

  return { score, breakdown }
}

// Badge de conformité
export function getConformityBadge(status: 'conforme' | 'attention' | 'non_conforme' | null): {
  emoji: string
  label: string
  color: string
  bgColor: string
} {
  switch (status) {
    case 'conforme':
      return { emoji: '🟢', label: 'Conforme', color: 'text-green-700', bgColor: 'bg-green-100' }
    case 'attention':
      return { emoji: '🟠', label: 'Attention', color: 'text-orange-700', bgColor: 'bg-orange-100' }
    case 'non_conforme':
      return { emoji: '🔴', label: 'Non conforme', color: 'text-red-700', bgColor: 'bg-red-100' }
    default:
      return { emoji: '⚪', label: 'Non évalué', color: 'text-gray-500', bgColor: 'bg-gray-100' }
  }
}
