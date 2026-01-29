import { GoogleGenerativeAI, Part } from '@google/generative-ai'
import type { OcrData, LigneFacture, ConformiteCheck } from '@/types/database'

if (!process.env.GOOGLE_GEMINI_API_KEY) {
  console.warn('GOOGLE_GEMINI_API_KEY is not set')
}

const genAI = process.env.GOOGLE_GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)
  : null

const MODEL_NAME = 'gemini-1.5-flash'

// Prompt Bio-Shield pour extraction multi-lignes + vérification conformité
const INVOICE_EXTRACTION_PROMPT = `Tu es un expert en agriculture biologique et en réglementation INAO.
Analyse cette facture et extrait TOUTES les informations de manière structurée.

IMPORTANT:
1. Extrais CHAQUE ligne de produit individuellement (pas seulement la première)
2. Pour chaque produit, évalue sa conformité au règlement Bio (CE) 2018/848

Retourne UNIQUEMENT un objet JSON valide (sans markdown, sans backticks):
{
  "fournisseur": "nom du fournisseur",
  "numero_facture": "numéro de facture",
  "date_facture": "YYYY-MM-DD",
  "total_ht": 0.00,
  "total_ttc": 0.00,
  "lignes": [
    {
      "id": "ligne_1",
      "description": "nom complet du produit",
      "quantite": 0,
      "unite": "kg/L/unité/sac/etc",
      "prix_unitaire": 0.00,
      "prix_total": 0.00,
      "tva": 5.5,
      "reference": "référence produit si visible",
      "is_bio": true/false,
      "numero_lot": "numéro de lot si visible",
      "conformite_status": "conforme/attention/non_conforme",
      "conformite_reason": "raison du statut de conformité",
      "confidence": 0.95
    }
  ],
  "raw_text": "texte brut extrait",
  "confidence_score": 0.90
}

Règles de conformité Bio-Shield:
- "conforme" (🟢): Produit certifié Bio, autorisé par le règlement CE 2018/848
- "attention" (🟠): Produit avec dérogation possible, ou mention Bio non vérifiable
- "non_conforme" (🔴): Produit interdit en Bio (pesticides chimiques, engrais de synthèse, OGM)

Indices de non-conformité:
- Produits phytosanitaires chimiques (glyphosate, métam-sodium, etc.)
- Engrais de synthèse (ammonitrate, superphosphate, etc.)
- Semences traitées non-Bio
- Produits sans mention Bio d'un fournisseur non certifié

Extrais TOUTES les lignes visibles sur la facture.`

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

  return JSON.parse(cleanedText)
}

// Fonction pour formater les données OCR
function formatOcrData(parsedData: Record<string, unknown>): OcrData {
  const lignes = (parsedData.lignes as Array<Record<string, unknown>>) || []

  return {
    fournisseur: (parsedData.fournisseur as string) || null,
    numero_facture: (parsedData.numero_facture as string) || null,
    date_facture: (parsedData.date_facture as string) || null,
    total_ht: typeof parsedData.total_ht === 'number' ? parsedData.total_ht : null,
    total_ttc: typeof parsedData.total_ttc === 'number' ? parsedData.total_ttc : null,
    lignes: lignes.map((ligne, index): LigneFacture => ({
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
      confidence: typeof ligne.confidence === 'number' ? ligne.confidence : 0.5,
    })),
    raw_text: (parsedData.raw_text as string) || null,
    confidence_score: typeof parsedData.confidence_score === 'number' ? parsedData.confidence_score : null,
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
      error: 'Gemini API non configurée',
    }
  }

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME })

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
      error: 'Gemini API non configurée',
    }
  }

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME })

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

// Vérification de conformité Bio-Shield pour un produit
const CONFORMITE_CHECK_PROMPT = `Tu es un expert en réglementation Bio (INAO, règlement CE 2018/848).
Analyse ce produit agricole et détermine sa conformité pour une exploitation Bio.

Produit: {PRODUCT_NAME}
Fournisseur: {SUPPLIER}
Marqué Bio: {IS_BIO}

Retourne UNIQUEMENT un objet JSON (sans markdown):
{
  "status": "conforme/attention/non_conforme",
  "reason": "explication courte",
  "details": ["point 1", "point 2"],
  "reglement_reference": "article du règlement si applicable"
}

Critères:
- "conforme": Produit explicitement autorisé en Bio
- "attention": Produit nécessitant vérification (dérogation possible)
- "non_conforme": Produit interdit en agriculture biologique`

export async function checkProductConformite(
  productName: string,
  supplier: string | null,
  isBio: boolean | null
): Promise<ConformiteCheck> {
  const defaultResult: ConformiteCheck = {
    status: 'attention',
    reason: 'Vérification automatique non disponible',
    details: [],
    reglement_reference: null,
  }

  if (!genAI) {
    return defaultResult
  }

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME })

    const prompt = CONFORMITE_CHECK_PROMPT
      .replace('{PRODUCT_NAME}', productName)
      .replace('{SUPPLIER}', supplier || 'Non spécifié')
      .replace('{IS_BIO}', isBio === true ? 'Oui' : isBio === false ? 'Non' : 'Non spécifié')

    const result = await model.generateContent(prompt)
    const response = result.response
    const text = response.text()

    const parsed = parseGeminiResponse(text)

    return {
      status: (parsed.status as 'conforme' | 'attention' | 'non_conforme') || 'attention',
      reason: (parsed.reason as string) || 'Analyse incomplète',
      details: (parsed.details as string[]) || [],
      reglement_reference: (parsed.reglement_reference as string) || null,
    }
  } catch (error) {
    console.error('Erreur vérification conformité:', error)
    return defaultResult
  }
}

// Vérification de certificat fournisseur manquant
export async function checkSupplierCertificate(
  fournisseur: string,
  certificatsExistants: Array<{ fournisseur_nom: string; date_expiration: string }>
): Promise<{
  exists: boolean
  expired: boolean
  expirationDate: string | null
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
      message: `Certificat manquant pour ${fournisseur}`,
    }
  }

  const expirationDate = new Date(matchingCert.date_expiration)
  const today = new Date()
  const isExpired = expirationDate < today

  return {
    exists: true,
    expired: isExpired,
    expirationDate: matchingCert.date_expiration,
    message: isExpired
      ? `Certificat expiré depuis le ${expirationDate.toLocaleDateString('fr-FR')}`
      : `Certificat valide jusqu'au ${expirationDate.toLocaleDateString('fr-FR')}`,
  }
}
