import { GoogleGenerativeAI, Part } from '@google/generative-ai'
import type { OcrData, LigneFacture, ConformiteCheck, AnalyseConformiteIA } from '@/types/database'

// Support pour les deux noms de variables d'environnement
const API_KEY = process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY

if (!API_KEY) {
  console.warn('GOOGLE_GENAI_API_KEY ou GOOGLE_GEMINI_API_KEY non définie')
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null

// Utiliser Gemini 2.0 Flash pour de meilleures performances
const MODEL_NAME = 'gemini-2.0-flash'

// =============================================================================
// TYPES POUR L'EXTRACTION AVANCEE
// =============================================================================

export interface ExtractedItem {
  raw_name: string           // Nom tel qu'écrit sur la facture
  clean_name: string         // Nom nettoyé sans codes internes
  lot_number: string | null  // Numéro de lot/batch
  quantity: number           // Quantité numérique
  unit: string              // kg, unités, litres, etc.
  unit_price: number | null  // Prix unitaire
  total_price: number | null // Prix total ligne
  is_bio_certified: boolean
  certification_marker: string | null  // Le symbole trouvé: "(1)", "(2)", "*", "AB", etc.
  certification_type: string | null    // Type de certification identifié
  confidence_score: number   // Score de confiance 0-1
  bounding_box: BoundingBox | null  // Coordonnées pour surlignage
  validation_warnings: string[]     // Alertes de validation
}

export interface BoundingBox {
  x: number       // Position X (0-1 normalisé)
  y: number       // Position Y (0-1 normalisé)
  width: number   // Largeur (0-1 normalisé)
  height: number  // Hauteur (0-1 normalisé)
  page: number    // Numéro de page (1-indexed)
}

export interface LegendEntry {
  marker: string           // "(1)", "(2)", "*", etc.
  meaning: string          // Signification complète
  is_bio_indicator: boolean // Indique une certification Bio
  certification_body: string | null // Organisme: Ecocert, Cosmos, etc.
}

export interface InvoiceMetadata {
  vendor_name: string | null
  vendor_siret: string | null
  vendor_siren: string | null
  vendor_address: string | null
  invoice_id: string | null
  invoice_date: string | null
  delivery_note_number: string | null
  order_number: string | null
  total_ht: number | null
  total_ttc: number | null
  total_tva: number | null
}

export interface ChainOfThoughtAnalysis {
  step1_constants: {
    vendor_siret_found: string | null
    vendor_siret_location: string | null
    invoice_id_found: string | null
    invoice_date_found: string | null
  }
  step2_legend: {
    legend_found: boolean
    legend_location: string | null
    legend_entries: LegendEntry[]
    bio_markers_identified: string[]
  }
  step3_table_structure: {
    columns_detected: string[]
    total_rows: number
    pages_analyzed: number
  }
}

export interface AdvancedOcrResult {
  success: boolean
  metadata: InvoiceMetadata
  chain_of_thought: ChainOfThoughtAnalysis
  items: ExtractedItem[]
  raw_text: string | null
  global_confidence: number
  processing_warnings: string[]
  error: string | null
}

// =============================================================================
// PROMPT CHAIN OF THOUGHT - EXTRACTION AVANCEE
// =============================================================================

const CHAIN_OF_THOUGHT_PROMPT = `Tu es un expert OCR spécialisé dans l'extraction de factures pour l'agriculture biologique.
Tu dois analyser ce document en suivant une méthodologie stricte "Chain of Thought".

# ETAPE 1: IDENTIFICATION DES CONSTANTES
Avant de lire les lignes, identifie et localise:
- Le SIRET/SIREN du fournisseur (généralement en bas ou en-tête, format: XXX XXX XXX XXXXX)
- Le numéro de facture
- La date de facture
- Le numéro de commande/BL si présent

# ETAPE 2: ANALYSE DE LA LEGENDE
CRITIQUE: Cherche une légende ou note de bas de page qui explique les symboles utilisés.
Exemples courants:
- "(1) indique les produits cosmétiques écologiques et biologiques (label Cosmos Organic)"
- "(2) indique les produits issus de l'agriculture biologique certifiés par ECOCERT FR-BIO-01"
- "* Produit certifié AB"
- "(3) indique les cosmétiques écologiques (Label Cosmébio)"

Pour CHAQUE symbole trouvé dans la légende, détermine s'il indique une certification Bio.

# ETAPE 3: PARSING EXHAUSTIF DES LIGNES
Parcours CHAQUE ligne du tableau de produits:
- Extrait le nom BRUT exactement comme écrit
- Nettoie le nom (enlève codes internes, références)
- Identifie le marqueur de certification s'il existe (ex: "(1)" devant la référence)
- Extrait le numéro de lot avec précision
- Note les coordonnées approximatives de chaque élément critique

# SCHEMA JSON OBLIGATOIRE

Retourne UNIQUEMENT ce JSON (sans markdown, sans backticks):
{
  "metadata": {
    "vendor_name": "Raison sociale complète",
    "vendor_siret": "SIRET 14 chiffres ou null",
    "vendor_siren": "SIREN 9 chiffres ou null",
    "vendor_address": "Adresse complète ou null",
    "invoice_id": "Numéro facture",
    "invoice_date": "YYYY-MM-DD",
    "delivery_note_number": "Numéro BL ou null",
    "order_number": "Numéro commande ou null",
    "total_ht": 0.00,
    "total_ttc": 0.00,
    "total_tva": 0.00
  },
  "chain_of_thought": {
    "step1_constants": {
      "vendor_siret_found": "41788089500038",
      "vendor_siret_location": "bas de page, ligne SIRET",
      "invoice_id_found": "DET2100791",
      "invoice_date_found": "2021-06-08"
    },
    "step2_legend": {
      "legend_found": true,
      "legend_location": "pied de page avant le tableau des taxes",
      "legend_entries": [
        {
          "marker": "(1)",
          "meaning": "produits cosmétiques écologiques et biologiques (label Cosmos Organic)",
          "is_bio_indicator": true,
          "certification_body": "Cosmos Organic"
        },
        {
          "marker": "(2)",
          "meaning": "produits issus de l'agriculture biologique certifiés par ECOCERT FR-BIO-01",
          "is_bio_indicator": true,
          "certification_body": "ECOCERT"
        }
      ],
      "bio_markers_identified": ["(1)", "(2)", "(3)"]
    },
    "step3_table_structure": {
      "columns_detected": ["Vos Réf.", "Nos Réf.", "Désignation", "N° Lot", "Qté", "PU HT", "Rem.", "PU Net", "Total", "TVA"],
      "total_rows": 25,
      "pages_analyzed": 2
    }
  },
  "items": [
    {
      "raw_name": "ROSÉE D'ALOÉ 76% Pur Aloé 250ml - Bio et Commerce Équitable - F",
      "clean_name": "Rosée d'Aloé 76% Pur Aloé 250ml Bio Commerce Équitable",
      "lot_number": "W015Y",
      "quantity": 6,
      "unit": "unités",
      "unit_price": 5.86,
      "total_price": 35.16,
      "is_bio_certified": true,
      "certification_marker": "(1)",
      "certification_type": "Cosmos Organic",
      "confidence_score": 0.95,
      "bounding_box": {
        "x": 0.15,
        "y": 0.35,
        "width": 0.7,
        "height": 0.025,
        "page": 1
      },
      "validation_warnings": []
    }
  ],
  "raw_text": "Texte brut extrait des zones principales",
  "global_confidence": 0.92,
  "processing_warnings": []
}

# REGLES CRITIQUES

1. SIRET: Format XXX XXX XXX XXXXX (14 chiffres). Souvent après "SIRET:" ou "RCS"
2. Le marqueur de certification est TOUJOURS dans la colonne "Nos Réf." ou juste avant la désignation
3. is_bio_certified = true SI ET SEULEMENT SI le marqueur trouvé correspond à un indicateur Bio dans la légende
4. Si aucune légende n'est trouvée, cherche les mentions directes: "Bio", "AB", "Ecocert", "FR-BIO-XX"
5. confidence_score:
   - 0.95+ : Numéro de lot clairement lisible, certification explicite
   - 0.80-0.94: Quelques caractères incertains mais lecture probable correcte
   - 0.60-0.79: Lecture difficile, validation recommandée
   - <0.60: Lecture très incertaine, vérification manuelle nécessaire
6. bounding_box: Coordonnées normalisées (0-1) de la zone contenant le numéro de lot

# POST-PROCESSING INTERNE

Avant de retourner le JSON, vérifie:
- Les numéros de lot ne contiennent pas de caractères incohérents (ex: "W01SY" vs "W015Y")
- Les quantités sont des nombres positifs
- Les prix sont cohérents (prix_total ≈ quantité × prix_unitaire)
- Chaque produit avec un marqueur Bio a bien is_bio_certified = true`

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

export interface GeminiOcrResult {
  success: boolean
  data: OcrData | null
  advancedData: AdvancedOcrResult | null
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

// Post-processing pour valider et corriger les numéros de lot
function validateAndCleanLotNumber(lotNumber: string | null): {
  cleaned: string | null
  confidence_adjustment: number
  warnings: string[]
} {
  if (!lotNumber) {
    return { cleaned: null, confidence_adjustment: 0, warnings: [] }
  }

  const warnings: string[] = []
  let cleaned = lotNumber.trim()
  let confidenceAdjustment = 0

  // Patterns suspects dans les numéros de lot
  const suspiciousPatterns = [
    { pattern: /[Il1]/g, replacement: '1', reason: 'Confusion possible I/l/1' },
    { pattern: /[O0]/g, replacement: '0', reason: 'Confusion possible O/0' },
    { pattern: /[S5]/g, replacement: null, reason: 'Confusion possible S/5' },
    { pattern: /[B8]/g, replacement: null, reason: 'Confusion possible B/8' },
  ]

  // Vérifier les caractères incohérents
  if (/[^A-Za-z0-9\-\/]/.test(cleaned)) {
    warnings.push('Caractères spéciaux inhabituels dans le numéro de lot')
    confidenceAdjustment -= 0.1
    // Nettoyer les caractères vraiment invalides
    cleaned = cleaned.replace(/[^\w\-\/]/g, '')
  }

  // Vérifier la longueur
  if (cleaned.length < 3) {
    warnings.push('Numéro de lot trop court - vérification recommandée')
    confidenceAdjustment -= 0.15
  }

  if (cleaned.length > 20) {
    warnings.push('Numéro de lot anormalement long - vérification recommandée')
    confidenceAdjustment -= 0.1
  }

  // Vérifier les confusions courantes
  for (const { reason } of suspiciousPatterns) {
    if (cleaned.match(/[IlO0S5B8]/)) {
      warnings.push(reason)
      confidenceAdjustment -= 0.05
      break // Une seule alerte suffit
    }
  }

  return { cleaned, confidence_adjustment: confidenceAdjustment, warnings }
}

// Convertir AdvancedOcrResult vers OcrData (format legacy)
function convertToLegacyFormat(advanced: AdvancedOcrResult): OcrData {
  return {
    fournisseur: advanced.metadata.vendor_name,
    siren_fournisseur: advanced.metadata.vendor_siren,
    siret_fournisseur: advanced.metadata.vendor_siret,
    numero_facture: advanced.metadata.invoice_id,
    date_facture: advanced.metadata.invoice_date,
    total_ht: advanced.metadata.total_ht,
    total_ttc: advanced.metadata.total_ttc,
    lignes: advanced.items.map((item, index): LigneFacture => ({
      id: `ligne_${index + 1}`,
      description: item.clean_name,
      quantite: item.quantity,
      unite: item.unit,
      prix_unitaire: item.unit_price,
      prix_total: item.total_price,
      tva: null, // Non extrait individuellement
      reference: null,
      is_bio: item.is_bio_certified,
      numero_lot: item.lot_number,
      conformite_status: item.is_bio_certified ? 'conforme' : 'attention',
      conformite_reason: item.is_bio_certified
        ? `Certifié ${item.certification_type || 'Bio'} (marqueur: ${item.certification_marker})`
        : 'Certification Bio non identifiée',
      score_conformite: Math.round(item.confidence_score * 100),
      analyse_ia: {
        status: item.is_bio_certified ? 'conforme' : 'attention',
        score: Math.round(item.confidence_score * 100),
        raisons: item.is_bio_certified
          ? [`Marqueur ${item.certification_marker} identifié comme certification Bio`]
          : ['Aucun marqueur de certification Bio trouvé'],
        recommandations: item.validation_warnings.length > 0
          ? ['Vérifier manuellement: ' + item.validation_warnings.join(', ')]
          : [],
        reglements_references: item.is_bio_certified
          ? ['Règlement (UE) 2018/848']
          : [],
      },
      confidence: item.confidence_score,
    })),
    raw_text: advanced.raw_text,
    confidence_score: advanced.global_confidence,
    verification_fournisseur: null,
  }
}

// Formater les données avancées depuis la réponse Gemini
function formatAdvancedOcrData(parsedData: Record<string, unknown>): AdvancedOcrResult {
  const metadata = (parsedData.metadata as Record<string, unknown>) || {}
  const chainOfThought = (parsedData.chain_of_thought as Record<string, unknown>) || {}
  const items = (parsedData.items as Array<Record<string, unknown>>) || []

  // Extraire chain of thought
  const step1 = (chainOfThought.step1_constants as Record<string, unknown>) || {}
  const step2 = (chainOfThought.step2_legend as Record<string, unknown>) || {}
  const step3 = (chainOfThought.step3_table_structure as Record<string, unknown>) || {}

  // Formater les entrées de légende
  const legendEntries: LegendEntry[] = Array.isArray(step2.legend_entries)
    ? (step2.legend_entries as Array<Record<string, unknown>>).map(entry => ({
        marker: (entry.marker as string) || '',
        meaning: (entry.meaning as string) || '',
        is_bio_indicator: (entry.is_bio_indicator as boolean) || false,
        certification_body: (entry.certification_body as string) || null,
      }))
    : []

  // Créer un lookup des marqueurs Bio
  const bioMarkers = new Set(
    legendEntries
      .filter(e => e.is_bio_indicator)
      .map(e => e.marker)
  )

  // Formater les items avec post-processing
  const formattedItems: ExtractedItem[] = items.map(item => {
    const rawLotNumber = (item.lot_number as string) || null
    const lotValidation = validateAndCleanLotNumber(rawLotNumber)

    // Déterminer si certifié Bio
    const marker = (item.certification_marker as string) || null
    const isBioCertified = marker ? bioMarkers.has(marker) : (item.is_bio_certified as boolean) || false

    // Calculer le score de confiance ajusté
    let confidence = typeof item.confidence_score === 'number'
      ? item.confidence_score
      : 0.7
    confidence = Math.max(0, Math.min(1, confidence + lotValidation.confidence_adjustment))

    // Extraire bounding box si présent
    const bb = item.bounding_box as Record<string, unknown> | null
    const boundingBox: BoundingBox | null = bb ? {
      x: typeof bb.x === 'number' ? bb.x : 0,
      y: typeof bb.y === 'number' ? bb.y : 0,
      width: typeof bb.width === 'number' ? bb.width : 0,
      height: typeof bb.height === 'number' ? bb.height : 0,
      page: typeof bb.page === 'number' ? bb.page : 1,
    } : null

    // Trouver le type de certification depuis la légende
    const certEntry = legendEntries.find(e => e.marker === marker)
    const certificationType = certEntry?.certification_body || (item.certification_type as string) || null

    return {
      raw_name: (item.raw_name as string) || '',
      clean_name: (item.clean_name as string) || (item.raw_name as string) || '',
      lot_number: lotValidation.cleaned,
      quantity: typeof item.quantity === 'number' ? item.quantity : 0,
      unit: (item.unit as string) || 'unité',
      unit_price: typeof item.unit_price === 'number' ? item.unit_price : null,
      total_price: typeof item.total_price === 'number' ? item.total_price : null,
      is_bio_certified: isBioCertified,
      certification_marker: marker,
      certification_type: certificationType,
      confidence_score: confidence,
      bounding_box: boundingBox,
      validation_warnings: [
        ...(Array.isArray(item.validation_warnings) ? item.validation_warnings as string[] : []),
        ...lotValidation.warnings,
      ],
    }
  })

  // Calculer le score de confiance global
  const avgConfidence = formattedItems.length > 0
    ? formattedItems.reduce((sum, item) => sum + item.confidence_score, 0) / formattedItems.length
    : 0.5

  return {
    success: true,
    metadata: {
      vendor_name: (metadata.vendor_name as string) || null,
      vendor_siret: (metadata.vendor_siret as string) || null,
      vendor_siren: (metadata.vendor_siren as string) || null,
      vendor_address: (metadata.vendor_address as string) || null,
      invoice_id: (metadata.invoice_id as string) || null,
      invoice_date: (metadata.invoice_date as string) || null,
      delivery_note_number: (metadata.delivery_note_number as string) || null,
      order_number: (metadata.order_number as string) || null,
      total_ht: typeof metadata.total_ht === 'number' ? metadata.total_ht : null,
      total_ttc: typeof metadata.total_ttc === 'number' ? metadata.total_ttc : null,
      total_tva: typeof metadata.total_tva === 'number' ? metadata.total_tva : null,
    },
    chain_of_thought: {
      step1_constants: {
        vendor_siret_found: (step1.vendor_siret_found as string) || null,
        vendor_siret_location: (step1.vendor_siret_location as string) || null,
        invoice_id_found: (step1.invoice_id_found as string) || null,
        invoice_date_found: (step1.invoice_date_found as string) || null,
      },
      step2_legend: {
        legend_found: (step2.legend_found as boolean) || false,
        legend_location: (step2.legend_location as string) || null,
        legend_entries: legendEntries,
        bio_markers_identified: Array.isArray(step2.bio_markers_identified)
          ? step2.bio_markers_identified as string[]
          : [],
      },
      step3_table_structure: {
        columns_detected: Array.isArray(step3.columns_detected)
          ? step3.columns_detected as string[]
          : [],
        total_rows: typeof step3.total_rows === 'number' ? step3.total_rows : 0,
        pages_analyzed: typeof step3.pages_analyzed === 'number' ? step3.pages_analyzed : 1,
      },
    },
    items: formattedItems,
    raw_text: (parsedData.raw_text as string) || null,
    global_confidence: avgConfidence,
    processing_warnings: Array.isArray(parsedData.processing_warnings)
      ? parsedData.processing_warnings as string[]
      : [],
    error: null,
  }
}

// =============================================================================
// FONCTION PRINCIPALE D'ANALYSE
// =============================================================================

export async function analyzeInvoiceWithGemini(
  imageBase64: string,
  mimeType: string
): Promise<GeminiOcrResult> {
  if (!genAI) {
    return {
      success: false,
      data: null,
      advancedData: null,
      error: 'Gemini API non configurée. Vérifiez GOOGLE_GENAI_API_KEY.',
    }
  }

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.1, // Très bas pour éviter les hallucinations sur les numéros de lot
        topP: 0.95,
        maxOutputTokens: 16384, // Augmenté pour les factures multi-pages
      },
    })

    const imagePart: Part = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    }

    const result = await model.generateContent([CHAIN_OF_THOUGHT_PROMPT, imagePart])
    const response = result.response
    const text = response.text()

    const parsedData = parseGeminiResponse(text)
    const advancedData = formatAdvancedOcrData(parsedData)
    const legacyData = convertToLegacyFormat(advancedData)

    return {
      success: true,
      data: legacyData,
      advancedData: advancedData,
      error: null,
    }
  } catch (error) {
    console.error('Erreur Gemini OCR:', error)
    return {
      success: false,
      data: null,
      advancedData: null,
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
      advancedData: null,
      error: 'Gemini API non configurée. Vérifiez GOOGLE_GENAI_API_KEY.',
    }
  }

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 16384,
      },
    })

    const pdfPart: Part = {
      inlineData: {
        data: pdfBase64,
        mimeType: 'application/pdf',
      },
    }

    const result = await model.generateContent([CHAIN_OF_THOUGHT_PROMPT, pdfPart])
    const response = result.response
    const text = response.text()

    const parsedData = parseGeminiResponse(text)
    const advancedData = formatAdvancedOcrData(parsedData)
    const legacyData = convertToLegacyFormat(advancedData)

    return {
      success: true,
      data: legacyData,
      advancedData: advancedData,
      error: null,
    }
  } catch (error) {
    console.error('Erreur Gemini PDF OCR:', error)
    return {
      success: false,
      data: null,
      advancedData: null,
      error: error instanceof Error ? error.message : 'Erreur analyse PDF',
    }
  }
}

// =============================================================================
// ANALYSE DE CONFORMITE (INCHANGE)
// =============================================================================

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

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

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

// Types are already exported via their interface declarations above
