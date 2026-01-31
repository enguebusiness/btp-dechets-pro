import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { OcrData, IntrantExtrait } from '@/types/database'
import { v4 as uuidv4 } from 'uuid'

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

    const body = await request.json()
    const {
      documentId,
      exploitationId,
      ocrData,
      selectedLineIds,
      createIntrants = true,
    } = body as {
      documentId: string
      exploitationId: string
      ocrData: OcrData
      selectedLineIds: string[]
      createIntrants?: boolean
    }

    if (!documentId || !exploitationId || !ocrData) {
      return NextResponse.json(
        { error: 'Données manquantes' },
        { status: 400 }
      )
    }

    // Vérifier que le document appartient à l'utilisateur
    const { data: document, error: docError } = await supabase
      .from('documents_storage')
      .select('id, exploitation_id')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document non trouvé' },
        { status: 404 }
      )
    }

    // Vérifier que l'exploitation appartient à l'utilisateur
    const { data: exploitation, error: exploitationError } = await supabase
      .from('exploitations')
      .select('id')
      .eq('id', exploitationId)
      .eq('user_id', user.id)
      .single()

    if (exploitationError || !exploitation) {
      return NextResponse.json(
        { error: 'Exploitation non trouvée' },
        { status: 404 }
      )
    }

    const intrantsExtraits: IntrantExtrait[] = []
    const createdIntrants: string[] = []

    // Créer les intrants si demandé
    if (createIntrants && selectedLineIds.length > 0) {
      const selectedLines = ocrData.lignes.filter(l => selectedLineIds.includes(l.id))

      for (const ligne of selectedLines) {
        const intrantId = uuidv4()

        // Déterminer le type d'intrant basé sur la description
        let typeIntrant: 'semence' | 'engrais' | 'phytosanitaire' | 'amendement' | 'autre' = 'autre'
        const descLower = ligne.description.toLowerCase()

        if (descLower.includes('semence') || descLower.includes('graine')) {
          typeIntrant = 'semence'
        } else if (descLower.includes('engrais') || descLower.includes('fertilisant') || descLower.includes('npk')) {
          typeIntrant = 'engrais'
        } else if (descLower.includes('phyto') || descLower.includes('fongicide') || descLower.includes('herbicide') || descLower.includes('insecticide')) {
          typeIntrant = 'phytosanitaire'
        } else if (descLower.includes('amendement') || descLower.includes('chaux') || descLower.includes('compost')) {
          typeIntrant = 'amendement'
        }

        const intrantData = {
          id: intrantId,
          exploitation_id: exploitationId,
          document_id: documentId,
          nom_produit: ligne.description,
          fournisseur: ocrData.fournisseur || null,
          numero_lot: ligne.numero_lot || null,
          quantite: ligne.quantite || 0,
          unite: ligne.unite || 'unite',
          date_achat: ocrData.date_facture || new Date().toISOString().split('T')[0],
          date_utilisation: null,
          prix_unitaire: ligne.prix_unitaire || null,
          prix_total: ligne.prix_total || null,
          certifie_bio: ligne.is_bio || false,
          numero_certificat: null,
          type_intrant: typeIntrant,
          conforme: ligne.is_bio ? true : null,
          notes: `Importé automatiquement depuis facture ${ocrData.numero_facture || 'N/A'} - Ref: ${ligne.reference || 'N/A'}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        const { error: insertError } = await supabase
          .from('intrants')
          .insert(intrantData)

        if (insertError) {
          console.error('Erreur création intrant:', insertError)
          intrantsExtraits.push({
            ligne_id: ligne.id,
            intrant_id: null,
            status: 'rejected',
            mapped_data: intrantData,
          })
        } else {
          createdIntrants.push(intrantId)
          intrantsExtraits.push({
            ligne_id: ligne.id,
            intrant_id: intrantId,
            status: 'validated',
            mapped_data: intrantData,
          })
        }
      }
    }

    // Mettre à jour le document avec les données OCR validées
    const { error: updateError } = await supabase
      .from('documents_storage')
      .update({
        ocr_processed: true,
        ocr_data: ocrData,
        ocr_validated: true,
        validation_date: new Date().toISOString(),
        intrants_extraits: intrantsExtraits,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    if (updateError) {
      console.error('Erreur mise à jour document:', updateError)
      return NextResponse.json(
        { error: `Erreur mise à jour: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      intrantsCreated: createdIntrants.length,
      intrantsExtraits,
    })
  } catch (error) {
    console.error('Erreur validation OCR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    )
  }
}
