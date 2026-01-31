import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// L'API Agence Bio n'est pas publiquement documentée, on utilise leur endpoint de recherche
const AGENCE_BIO_SEARCH_URL = 'https://opendata.agencebio.org/api/gouv/operateurs'

interface AgenceBioOperateur {
  id: number
  numeroBio: string
  siret: string
  raisonSociale: string
  denominationcourante: string
  adressesOperateurs: Array<{
    lieu: string
    codePostal: string
    ville: string
    pays: string
  }>
  activites: Array<{
    nom: string
    etatCertificationBio: string
  }>
  certificats: Array<{
    organisme: string
    dateEngagement: string
    dateSuspension: string | null
    dateArret: string | null
    url: string | null
  }>
}

interface AgenceBioResponse {
  items: AgenceBioOperateur[]
  total: number
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { siret, nom, type = 'exploitation' } = body

    if (!siret && !nom) {
      return NextResponse.json(
        { error: 'SIRET ou nom requis' },
        { status: 400 }
      )
    }

    // Construire les paramètres de recherche
    const searchParams = new URLSearchParams()

    if (siret) {
      // Nettoyer le SIRET (enlever espaces et tirets)
      const cleanSiret = siret.replace(/[\s-]/g, '')
      searchParams.set('siret', cleanSiret)
    } else if (nom) {
      searchParams.set('nom', nom)
    }

    // Appel à l'API Agence Bio
    const response = await fetch(
      `${AGENCE_BIO_SEARCH_URL}?${searchParams.toString()}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      // Si l'API n'est pas disponible, on retourne un résultat vide mais pas d'erreur
      console.error('Erreur API Agence Bio:', response.status)
      return NextResponse.json({
        success: true,
        found: false,
        results: [],
        message: 'Service Agence Bio temporairement indisponible',
      })
    }

    const data: AgenceBioResponse = await response.json()

    if (!data.items || data.items.length === 0) {
      return NextResponse.json({
        success: true,
        found: false,
        results: [],
        message: siret
          ? `Aucun opérateur Bio trouvé avec le SIRET ${siret}`
          : `Aucun opérateur Bio trouvé avec le nom "${nom}"`,
      })
    }

    // Transformer les résultats
    const results = data.items.map((op) => {
      // Déterminer le statut Bio
      let statutBio: 'certifie' | 'en_conversion' | 'non_certifie' = 'non_certifie'
      const activitesBio = op.activites?.filter(
        (a) => a.etatCertificationBio === 'ENGAGEE'
      ) || []

      if (activitesBio.length > 0) {
        // Vérifier si c'est une conversion ou une certification complète
        const hasConversion = activitesBio.some((a) =>
          a.nom.toLowerCase().includes('conversion')
        )
        statutBio = hasConversion ? 'en_conversion' : 'certifie'
      }

      // Récupérer le certificat actif
      const certificatActif = op.certificats?.find(
        (c) => !c.dateSuspension && !c.dateArret
      )

      const adresse = op.adressesOperateurs?.[0]

      return {
        id: String(op.id),
        nom: op.denominationcourante || op.raisonSociale,
        siret: op.siret,
        siren: op.siret ? op.siret.substring(0, 9) : null,
        numero_bio: op.numeroBio,
        statut: statutBio,
        organisme_certificateur: certificatActif?.organisme || null,
        date_certification: certificatActif?.dateEngagement || null,
        adresse: adresse?.lieu || null,
        code_postal: adresse?.codePostal || null,
        ville: adresse?.ville || null,
        activites: activitesBio.map((a) => a.nom),
        url_fiche: `https://annuaire.agencebio.org/fiche/${op.id}`,
        url_certificat: certificatActif?.url || null,
      }
    })

    // Logger la vérification
    if (type === 'exploitation') {
      const exploitationId = body.exploitationId
      if (exploitationId) {
        await supabase.from('audit_logs').insert({
          exploitation_id: exploitationId,
          type: 'verification_agence_bio',
          entite_type: 'exploitation',
          entite_id: exploitationId,
          action: `Vérification Agence Bio par ${siret ? 'SIRET' : 'nom'}`,
          details: {
            recherche: siret || nom,
            resultats_count: results.length,
            found: results.length > 0,
          },
          resultat: results.length > 0 ? 'succes' : 'echec',
        })
      }
    }

    return NextResponse.json({
      success: true,
      found: results.length > 0,
      results,
      total: data.total,
    })
  } catch (error) {
    console.error('Erreur vérification Agence Bio:', error)
    return NextResponse.json(
      {
        success: false,
        found: false,
        results: [],
        error: 'Erreur lors de la vérification',
      },
      { status: 500 }
    )
  }
}

// GET pour une recherche simple
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const siret = searchParams.get('siret')
  const nom = searchParams.get('nom')

  if (!siret && !nom) {
    return NextResponse.json(
      { error: 'Paramètre siret ou nom requis' },
      { status: 400 }
    )
  }

  // Réutiliser la logique POST
  const fakeRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ siret, nom }),
  })

  return POST(fakeRequest)
}
