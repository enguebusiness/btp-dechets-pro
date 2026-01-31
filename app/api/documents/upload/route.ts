import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Verifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifie' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const exploitationId = formData.get('exploitationId') as string | null
    const typeDocument = formData.get('typeDocument') as string || 'autre'

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

    // Verifier que l'exploitation appartient a l'utilisateur
    const { data: exploitation, error: exploitationError } = await supabase
      .from('exploitations')
      .select('id')
      .eq('id', exploitationId)
      .eq('owner_id', user.id)
      .single()

    if (exploitationError || !exploitation) {
      return NextResponse.json(
        { error: 'Exploitation non trouvee ou acces refuse' },
        { status: 404 }
      )
    }

    // Verifier la taille (max 50MB)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Fichier trop volumineux (max 50MB)' },
        { status: 400 }
      )
    }

    // Generer un nom de fichier unique
    const fileExtension = file.name.split('.').pop() || ''
    const uniqueFileName = `${uuidv4()}.${fileExtension}`
    const storagePath = `${exploitationId}/${uniqueFileName}`

    // Upload vers Supabase Storage
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Erreur upload storage:', uploadError)
      return NextResponse.json(
        { error: `Erreur upload: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Calculer la date de conservation (5 ans pour documents Bio)
    const dateDocument = new Date()
    const conservationDate = new Date()
    conservationDate.setFullYear(conservationDate.getFullYear() + 5)

    // Creer l'entree en base de donnees
    // IMPORTANT: Utilise les colonnes reelles de documents_storage
    const documentData = {
      id: uuidv4(),
      exploitation_id: exploitationId,
      file_name: file.name, // Colonne reelle = file_name (pas nom_fichier)
      type_doc: typeDocument,
      date_document: dateDocument.toISOString().split('T')[0], // Colonne reelle = date_document
      storage_path: storagePath,
      conservation_jusqu_a: conservationDate.toISOString().split('T')[0], // Colonne reelle
      statut: 'A_VERIFIER', // Colonne reelle avec valeur par defaut
      ocr_processed: false, // Sera ajoute par migration
    }

    const { data: document, error: insertError } = await supabase
      .from('documents_storage')
      .insert(documentData)
      .select()
      .single()

    if (insertError) {
      console.error('Erreur insertion base:', insertError)

      // En cas d'erreur d'insertion, supprimer le fichier uploade
      await supabase.storage
        .from('documents')
        .remove([storagePath])

      // Analyser l'erreur pour donner un message plus precis
      let errorMessage = 'Erreur lors de l\'enregistrement'

      if (insertError.code === '23503') {
        errorMessage = 'Reference invalide: l\'exploitation n\'existe pas'
      } else if (insertError.code === '23505') {
        errorMessage = 'Un document avec cet identifiant existe deja'
      } else if (insertError.code === '42P01') {
        errorMessage = 'Table documents_storage introuvable'
      } else if (insertError.code === '42501' || insertError.message?.includes('row-level security')) {
        errorMessage = 'Permission refusee: verifiez les politiques RLS'
      } else if (insertError.code === '42703') {
        // Colonne invalide - essayer sans ocr_processed
        console.log('Colonne manquante, retry sans ocr_processed')
        const minimalData = {
          id: documentData.id,
          exploitation_id: exploitationId,
          file_name: file.name,
          type_doc: typeDocument,
          date_document: dateDocument.toISOString().split('T')[0],
          storage_path: storagePath,
          conservation_jusqu_a: conservationDate.toISOString().split('T')[0],
        }

        const { data: doc2, error: err2 } = await supabase
          .from('documents_storage')
          .insert(minimalData)
          .select()
          .single()

        if (err2) {
          errorMessage = `Colonne invalide: ${err2.message}`
        } else {
          // Success avec donnees minimales
          const { data: signedUrlData } = await supabase.storage
            .from('documents')
            .createSignedUrl(storagePath, 3600)

          return NextResponse.json({
            success: true,
            document: {
              ...doc2,
              signed_url: signedUrlData?.signedUrl,
            },
            warning: 'Executez la migration 004_bio_audit_adaptation.sql pour activer toutes les fonctionnalites'
          })
        }
      } else if (insertError.message) {
        errorMessage = insertError.message
      }

      return NextResponse.json(
        { error: errorMessage, details: insertError },
        { status: 500 }
      )
    }

    // Generer l'URL signee pour le telechargement
    const { data: signedUrlData } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600)

    return NextResponse.json({
      success: true,
      document: {
        ...document,
        signed_url: signedUrlData?.signedUrl,
      },
    })
  } catch (error) {
    console.error('Erreur upload document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    )
  }
}
