import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { analyzeInvoiceWithGemini, analyzePdfWithGemini } from '@/lib/gemini'

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

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Erreur lors de l\'analyse' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.data,
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
