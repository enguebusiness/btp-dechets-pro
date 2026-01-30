import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { analyzeInvoiceWithGemini, analyzePdfWithGemini, calculateGlobalConformityScore } from '@/lib/gemini'

export const maxDuration = 60 // Timeout de 60 secondes pour l'OCR

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const exploitationId = formData.get('exploitationId') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni' },
        { status: 400 }
      )
    }

    if (!exploitationId) {
      return NextResponse.json(
        { error: 'ID exploitation requis' },
        { status: 400 }
      )
    }

    // Vérifier que l'exploitation appartient à l'utilisateur (owner_id)
    const { data: exploitation, error: exploitationError } = await supabase
      .from('exploitations')
      .select('id, name')
      .eq('id', exploitationId)
      .eq('owner_id', user.id)
      .single()

    if (exploitationError || !exploitation) {
      return NextResponse.json(
        { error: 'Exploitation non trouvée ou accès non autorisé' },
        { status: 404 }
      )
    }

    // Vérifier le type de fichier
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Type de fichier non supporté. Utilisez JPG, PNG, WebP ou PDF.' },
        { status: 400 }
      )
    }

    // Vérifier la taille (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Fichier trop volumineux (max 10MB)' },
        { status: 400 }
      )
    }

    // Convertir en base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Analyser avec Gemini
    let result
    if (file.type === 'application/pdf') {
      result = await analyzePdfWithGemini(base64)
    } else {
      result = await analyzeInvoiceWithGemini(base64, file.type)
    }

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || 'Erreur lors de l\'analyse' },
        { status: 500 }
      )
    }

    // Vérifier le fournisseur via Agence Bio si SIREN détecté
    let supplierVerification = null
    if (result.data.siren_fournisseur || result.data.fournisseur) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'

        const searchParam = result.data.siren_fournisseur
          ? { siret: result.data.siren_fournisseur }
          : { nom: result.data.fournisseur }

        const verifyResponse = await fetch(
          `${baseUrl}/api/agence-bio/verify`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...searchParam,
              type: 'supplier',
              exploitationId,
            }),
          }
        )

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json()
          if (verifyData.found && verifyData.results.length > 0) {
            const supplier = verifyData.results[0]
            supplierVerification = {
              found: true,
              agence_bio_id: supplier.id,
              nom_officiel: supplier.nom,
              statut_bio: supplier.statut,
              numero_bio: supplier.numero_bio,
              organisme_certificateur: supplier.organisme_certificateur,
              date_certification: supplier.date_certification,
              activites: supplier.activites || [],
              url_fiche: supplier.url_fiche,
              date_verification: new Date().toISOString(),
            }
          }
        }
      } catch (verifyError) {
        console.error('Erreur vérification fournisseur:', verifyError)
        // On continue sans la vérification
      }
    }

    // Calculer le score de conformité global
    const conformityScore = calculateGlobalConformityScore(result.data.lignes)

    // Logger l'analyse dans audit_logs (ignorer si table n'existe pas)
    try {
      await supabase.from('audit_logs').insert({
        exploitation_id: exploitationId,
        type: 'scan_facture',
        entite_type: 'document',
        action: `Scan facture: ${file.name}`,
        details: {
          filename: file.name,
          filesize: file.size,
          mimetype: file.type,
          fournisseur: result.data.fournisseur,
          siren_fournisseur: result.data.siren_fournisseur,
          lignes_count: result.data.lignes.length,
          conformity_score: conformityScore.score,
          supplier_verified: supplierVerification?.found || false,
        },
        resultat: conformityScore.breakdown.non_conforme > 0 ? 'attention' : 'succes',
      })
    } catch {
      // Table audit_logs peut ne pas exister
    }

    // Ajouter la vérification fournisseur aux données
    const enrichedData = {
      ...result.data,
      verification_fournisseur: supplierVerification,
    }

    return NextResponse.json({
      success: true,
      data: enrichedData,
      conformity: conformityScore,
      filename: file.name,
      filesize: file.size,
      mimetype: file.type,
    })
  } catch (error) {
    console.error('Erreur OCR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    )
  }
}
