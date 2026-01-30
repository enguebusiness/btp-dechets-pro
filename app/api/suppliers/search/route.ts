import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { exploitationId, searchTerm, codePostal, limit = 20 } = body

    if (!exploitationId) {
      return NextResponse.json(
        { error: 'ID exploitation requis' },
        { status: 400 }
      )
    }

    if (!searchTerm || searchTerm.trim().length < 2) {
      return NextResponse.json(
        { error: 'Terme de recherche trop court (min 2 caractères)' },
        { status: 400 }
      )
    }

    // Vérifier accès à l'exploitation
    const { data: exploitation, error: exploitationError } = await supabase
      .from('exploitations')
      .select('id')
      .eq('id', exploitationId)
      .eq('owner_id', user.id)
      .single()

    if (exploitationError || !exploitation) {
      return NextResponse.json(
        { error: 'Exploitation non trouvée ou accès non autorisé' },
        { status: 404 }
      )
    }

    // Nettoyer le terme de recherche
    const cleanSearch = searchTerm.trim().toLowerCase()

    // Extraire un éventuel code postal du terme de recherche
    const postalMatch = cleanSearch.match(/\b(\d{5})\b/)
    const extractedPostal = postalMatch ? postalMatch[1] : codePostal

    // Recherche avec ilike pour être compatible sans pg_trgm
    // La fonction SQL fuzzy sera utilisée si l'extension est activée
    let query = supabase
      .from('suppliers')
      .select('*')
      .eq('exploitation_id', exploitationId)

    // Construire la recherche multi-critères
    const searchParts = cleanSearch.replace(/\d{5}/g, '').trim().split(/\s+/).filter(Boolean)

    if (searchParts.length > 0) {
      // Recherche OR sur nom et ville pour chaque mot
      const orConditions = searchParts.map((part: string) =>
        `nom.ilike.%${part}%,ville.ilike.%${part}%,siren.ilike.%${part}%`
      ).join(',')

      query = query.or(orConditions)
    }

    // Filtrer par code postal si fourni
    if (extractedPostal) {
      query = query.or(`code_postal.eq.${extractedPostal}`)
    }

    const { data: suppliers, error: searchError } = await query
      .order('nom')
      .limit(limit)

    if (searchError) {
      console.error('Erreur recherche fournisseurs:', searchError)
      return NextResponse.json(
        { error: `Erreur de recherche: ${searchError.message}` },
        { status: 500 }
      )
    }

    // Calculer un score de pertinence simple côté JS
    const scoredResults = (suppliers || []).map(supplier => {
      let score = 0
      const nomLower = supplier.nom.toLowerCase()
      const villeLower = (supplier.ville || '').toLowerCase()

      searchParts.forEach((part: string) => {
        if (nomLower.includes(part)) score += 3
        if (nomLower.startsWith(part)) score += 2
        if (villeLower.includes(part)) score += 1
      })

      if (extractedPostal && supplier.code_postal === extractedPostal) {
        score += 5
      }

      return { ...supplier, relevance_score: score }
    })

    // Trier par score décroissant
    scoredResults.sort((a, b) => b.relevance_score - a.relevance_score)

    return NextResponse.json({
      success: true,
      results: scoredResults,
      count: scoredResults.length,
      searchTerm: cleanSearch,
      extractedPostal,
    })
  } catch (error) {
    console.error('Erreur API recherche fournisseurs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const exploitationId = searchParams.get('exploitationId')
  const searchTerm = searchParams.get('q')
  const codePostal = searchParams.get('cp')

  if (!exploitationId || !searchTerm) {
    return NextResponse.json(
      { error: 'Paramètres exploitationId et q requis' },
      { status: 400 }
    )
  }

  const fakeRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ exploitationId, searchTerm, codePostal }),
  })

  return POST(fakeRequest)
}
