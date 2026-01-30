import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 30

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
    const typeDocument = formData.get('typeDocument') as string || 'autre'
    const notes = formData.get('notes') as string || null

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

    // Vérifier que l'exploitation appartient à l'utilisateur
    const { data: exploitation, error: exploitationError } = await supabase
      .from('exploitations')
      .select('id')
      .eq('id', exploitationId)
      .eq('owner_id', user.id)
      .single()

    if (exploitationError || !exploitation) {
      return NextResponse.json(
        { error: 'Exploitation non trouvée' },
        { status: 404 }
      )
    }

    // Vérifier la taille (max 50MB)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Fichier trop volumineux (max 50MB)' },
        { status: 400 }
      )
    }

    // Générer un nom de fichier unique
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

    // Créer l'entrée en base de données
    const documentData = {
      id: uuidv4(),
      exploitation_id: exploitationId,
      user_id: user.id,
      nom_fichier: file.name,
      type_doc: typeDocument as 'facture' | 'certificat' | 'bon_livraison' | 'analyse' | 'autre',
      storage_path: storagePath,
      taille: file.size,
      mime_type: file.type,
      ocr_processed: false,
      ocr_data: null,
      ocr_validated: false,
      validation_date: null,
      intrants_extraits: [],
      notes: notes,
    }

    const { data: document, error: insertError } = await supabase
      .from('documents_storage')
      .insert(documentData)
      .select()
      .single()

    if (insertError) {
      console.error('Erreur insertion base:', insertError)

      // En cas d'erreur d'insertion, supprimer le fichier uploadé
      await supabase.storage
        .from('documents')
        .remove([storagePath])

      // Analyser l'erreur pour donner un message plus précis
      let errorMessage = 'Erreur lors de l\'enregistrement'

      if (insertError.code === '23503') {
        errorMessage = 'Référence invalide: l\'exploitation n\'existe pas'
      } else if (insertError.code === '23505') {
        errorMessage = 'Un document avec cet identifiant existe déjà'
      } else if (insertError.code === '42P01') {
        errorMessage = 'La table documents_storage n\'existe pas. Veuillez créer la table dans Supabase.'
      } else if (insertError.code === '42501' || insertError.message?.includes('row-level security')) {
        errorMessage = 'Permission refusée: vérifiez les politiques RLS sur documents_storage'
      } else if (insertError.code === '42703') {
        errorMessage = `Colonne invalide: ${insertError.message}`
      } else if (insertError.message) {
        errorMessage = insertError.message
      }

      return NextResponse.json(
        { error: errorMessage, details: insertError },
        { status: 500 }
      )
    }

    // Générer l'URL signée pour le téléchargement
    const { data: signedUrlData } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600) // URL valide 1 heure

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
