'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useExploitation } from '@/contexts/ExploitationContext'
import type { ScoreSecurite, AlerteConformite } from '@/types/database'

interface DashboardStats {
  intrants: number
  intrantsConformes: number
  intrantsAttention: number
  intrantsNonConformes: number
  fournisseurs: number
  fournisseursCertifies: number
  certificats: number
  certificatsExpires: number
  documents: number
}

export default function DashboardPage() {
  const { activeExploitation, loading: exploitationLoading, alertesCertificats } = useExploitation()
  const [stats, setStats] = useState<DashboardStats>({
    intrants: 0,
    intrantsConformes: 0,
    intrantsAttention: 0,
    intrantsNonConformes: 0,
    fournisseurs: 0,
    fournisseursCertifies: 0,
    certificats: 0,
    certificatsExpires: 0,
    documents: 0,
  })
  const [securityScore, setSecurityScore] = useState<ScoreSecurite | null>(null)
  const [loading, setLoading] = useState(true)
  const [verifyingExploitation, setVerifyingExploitation] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const loadStats = async () => {
      if (!activeExploitation) {
        setLoading(false)
        return
      }

      try {
        // Charger les statistiques en parallèle
        const [
          intrantsRes,
          intrantsConformesRes,
          intrantsAttentionRes,
          intrantsNonConformesRes,
          fournisseursRes,
          fournisseursCertifiesRes,
          certificatsRes,
          certificatsExpiresRes,
          documentsRes,
        ] = await Promise.all([
          supabase.from('intrants').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id),
          supabase.from('intrants').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id).eq('conformite_status', 'conforme'),
          supabase.from('intrants').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id).eq('conformite_status', 'attention'),
          supabase.from('intrants').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id).eq('conformite_status', 'non_conforme'),
          supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id),
          supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id).eq('statut_bio', 'certifie'),
          supabase.from('certificats_fournisseurs').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id),
          supabase.from('certificats_fournisseurs').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id).eq('statut', 'expire'),
          supabase.from('documents_storage').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id),
        ])

        const newStats = {
          intrants: intrantsRes.count || 0,
          intrantsConformes: intrantsConformesRes.count || 0,
          intrantsAttention: intrantsAttentionRes.count || 0,
          intrantsNonConformes: intrantsNonConformesRes.count || 0,
          fournisseurs: fournisseursRes.count || 0,
          fournisseursCertifies: fournisseursCertifiesRes.count || 0,
          certificats: certificatsRes.count || 0,
          certificatsExpires: certificatsExpiresRes.count || 0,
          documents: documentsRes.count || 0,
        }

        setStats(newStats)

        // Calculer le score de sécurité
        calculateSecurityScore(newStats, activeExploitation.agence_bio_verified || false)
      } catch (error) {
        console.error('Erreur chargement stats:', error)
      } finally {
        setLoading(false)
      }
    }

    if (!exploitationLoading) {
      loadStats()
    }
  }, [activeExploitation, exploitationLoading, supabase])

  const calculateSecurityScore = (stats: DashboardStats, exploitationVerified: boolean) => {
    const score: ScoreSecurite = {
      global: 0,
      details: {
        exploitation_verifiee: {
          score: exploitationVerified ? 20 : 0,
          max: 20,
          status: exploitationVerified,
        },
        intrants_conformes: {
          score: 0,
          max: 30,
          ratio: '0/0',
        },
        fournisseurs_certifies: {
          score: 0,
          max: 25,
          ratio: '0/0',
        },
        certificats_valides: {
          score: 0,
          max: 25,
          ratio: '0/0',
        },
      },
      alertes: [],
      recommandations: [],
      derniere_maj: new Date().toISOString(),
    }

    // Score intrants
    if (stats.intrants > 0) {
      const intrantScore = Math.round((stats.intrantsConformes / stats.intrants) * 30)
      score.details.intrants_conformes = {
        score: intrantScore,
        max: 30,
        ratio: `${stats.intrantsConformes}/${stats.intrants}`,
      }
    } else {
      score.details.intrants_conformes.score = 30
      score.details.intrants_conformes.ratio = 'N/A'
    }

    // Score fournisseurs
    if (stats.fournisseurs > 0) {
      const fournisseurScore = Math.round((stats.fournisseursCertifies / stats.fournisseurs) * 25)
      score.details.fournisseurs_certifies = {
        score: fournisseurScore,
        max: 25,
        ratio: `${stats.fournisseursCertifies}/${stats.fournisseurs}`,
      }
    } else {
      score.details.fournisseurs_certifies.score = 25
      score.details.fournisseurs_certifies.ratio = 'N/A'
    }

    // Score certificats
    if (stats.certificats > 0) {
      const certifValides = stats.certificats - stats.certificatsExpires
      const certifScore = Math.round((certifValides / stats.certificats) * 25)
      score.details.certificats_valides = {
        score: certifScore,
        max: 25,
        ratio: `${certifValides}/${stats.certificats}`,
      }
    } else {
      score.details.certificats_valides.score = 25
      score.details.certificats_valides.ratio = 'N/A'
    }

    // Score global
    score.global =
      score.details.exploitation_verifiee.score +
      score.details.intrants_conformes.score +
      score.details.fournisseurs_certifies.score +
      score.details.certificats_valides.score

    // Recommandations
    if (!exploitationVerified) {
      score.recommandations.push('Verifiez votre exploitation sur l\'Agence Bio pour gagner 20 points')
    }
    if (stats.intrantsNonConformes > 0) {
      score.recommandations.push(`${stats.intrantsNonConformes} intrant(s) non conforme(s) a corriger`)
    }
    if (stats.fournisseurs > 0 && stats.fournisseursCertifies < stats.fournisseurs) {
      score.recommandations.push('Verifiez la certification Bio de tous vos fournisseurs')
    }
    if (stats.certificatsExpires > 0) {
      score.recommandations.push(`${stats.certificatsExpires} certificat(s) expire(s) a renouveler`)
    }

    setSecurityScore(score)
  }

  const verifyExploitation = async () => {
    if (!activeExploitation?.siret) {
      alert('Ajoutez un SIRET a votre exploitation pour la verifier')
      return
    }

    setVerifyingExploitation(true)
    try {
      const response = await fetch('/api/agence-bio/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siret: activeExploitation.siret,
          type: 'exploitation',
          exploitationId: activeExploitation.id,
        }),
      })

      const data = await response.json()

      if (data.found && data.results.length > 0) {
        await supabase
          .from('exploitations')
          .update({
            agence_bio_verified: true,
            agence_bio_id: data.results[0].id,
            date_verif_agence_bio: new Date().toISOString(),
          })
          .eq('id', activeExploitation.id)

        alert('Exploitation verifiee avec succes sur l\'Agence Bio!')
        window.location.reload()
      } else {
        alert('Exploitation non trouvee dans l\'annuaire Agence Bio')
      }
    } catch (error) {
      console.error('Erreur verification:', error)
      alert('Erreur lors de la verification')
    } finally {
      setVerifyingExploitation(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    if (score >= 40) return 'text-orange-600'
    return 'text-red-600'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500'
    if (score >= 60) return 'bg-yellow-500'
    if (score >= 40) return 'bg-orange-500'
    return 'bg-red-500'
  }

  if (exploitationLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!activeExploitation) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Bienvenue sur Bio-Audit</h2>
        <p className="text-gray-600 mb-6">
          Votre bouclier de conformite Bio. Creez votre exploitation pour commencer.
        </p>
        <Link
          href="/dashboard/settings?tab=exploitations"
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Creer une exploitation
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec Score de Sécurité */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Score de Sécurité */}
        <div className="flex-1 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-gray-300">Score de Securite</h2>
              <p className="text-sm text-gray-400">{activeExploitation.name}</p>
            </div>
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>

          <div className="flex items-end gap-4 mb-6">
            <span className={`text-6xl font-bold ${getScoreColor(securityScore?.global || 0)}`}>
              {securityScore?.global || 0}
            </span>
            <span className="text-2xl text-gray-400 mb-2">/ 100</span>
          </div>

          {/* Barre de progression */}
          <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden mb-4">
            <div
              className={`h-full ${getScoreBgColor(securityScore?.global || 0)} transition-all duration-500`}
              style={{ width: `${securityScore?.global || 0}%` }}
            />
          </div>

          {/* Détails du score */}
          {securityScore && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Exploitation verifiee</span>
                <span className={securityScore.details.exploitation_verifiee.status ? 'text-green-400' : 'text-red-400'}>
                  {securityScore.details.exploitation_verifiee.status ? '20/20' : '0/20'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Intrants conformes</span>
                <span className="text-white">
                  {securityScore.details.intrants_conformes.score}/{securityScore.details.intrants_conformes.max}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Fournisseurs certifies</span>
                <span className="text-white">
                  {securityScore.details.fournisseurs_certifies.score}/{securityScore.details.fournisseurs_certifies.max}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Certificats valides</span>
                <span className="text-white">
                  {securityScore.details.certificats_valides.score}/{securityScore.details.certificats_valides.max}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions rapides */}
        <div className="lg:w-80 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Actions rapides</h3>
          <div className="space-y-3">
            <Link
              href="/dashboard/mangetout"
              className="flex items-center p-3 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
            >
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Scanner une facture</p>
                <p className="text-xs text-gray-500">OCR + Analyse conformite</p>
              </div>
            </Link>

            <Link
              href="/dashboard/fournisseurs"
              className="flex items-center p-3 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
            >
              <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Verifier un fournisseur</p>
                <p className="text-xs text-gray-500">Recherche Agence Bio</p>
              </div>
            </Link>

            <Link
              href="/dashboard/archives"
              className="flex items-center p-3 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
            >
              <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Generer Pack Audit</p>
                <p className="text-xs text-gray-500">Export annuel complet</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Alertes */}
      {(alertesCertificats.length > 0 || stats.intrantsNonConformes > 0 || !activeExploitation.agence_bio_verified) && (
        <div className="space-y-3">
          {!activeExploitation.agence_bio_verified && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">Exploitation non verifiee</h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    Verifiez votre exploitation sur l&apos;Annuaire Agence Bio pour augmenter votre score de securite.
                  </p>
                </div>
              </div>
              <button
                onClick={verifyExploitation}
                disabled={verifyingExploitation}
                className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                {verifyingExploitation ? 'Verification...' : 'Verifier'}
              </button>
            </div>
          )}

          {stats.intrantsNonConformes > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
              <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">Intrants non conformes</h3>
                <p className="text-sm text-red-700 mt-1">
                  {stats.intrantsNonConformes} intrant(s) marque(s) comme non conforme(s) au reglement Bio.
                  <Link href="/dashboard/registre" className="ml-1 underline hover:no-underline">
                    Voir le registre
                  </Link>
                </p>
              </div>
            </div>
          )}

          {alertesCertificats.filter(a => a.severity === 'critical').map((alerte) => (
            <div key={alerte.id} className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
              <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">{alerte.fournisseur}</h3>
                <p className="text-sm text-red-700 mt-1">{alerte.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/registre" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Intrants</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.intrants}</p>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-green-600">{stats.intrantsConformes} OK</span>
                <span className="text-orange-600">{stats.intrantsAttention} Att.</span>
                <span className="text-red-600">{stats.intrantsNonConformes} NC</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
        </Link>

        <Link href="/dashboard/fournisseurs" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Fournisseurs</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.fournisseurs}</p>
              <p className="text-xs text-green-600 mt-2">
                {stats.fournisseursCertifies} certifie(s) Bio
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
        </Link>

        <Link href="/dashboard/certificats" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Certificats</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.certificats}</p>
              {stats.certificatsExpires > 0 ? (
                <p className="text-xs text-red-600 mt-2">
                  {stats.certificatsExpires} expire(s)
                </p>
              ) : (
                <p className="text-xs text-green-600 mt-2">Tous valides</p>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
          </div>
        </Link>

        <Link href="/dashboard/archives" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Documents</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.documents}</p>
              <p className="text-xs text-gray-500 mt-2">Archives</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
          </div>
        </Link>
      </div>

      {/* Recommandations */}
      {securityScore && securityScore.recommandations.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Recommandations pour ameliorer votre score</h3>
          <ul className="space-y-2">
            {securityScore.recommandations.map((rec, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Infos exploitation */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Informations exploitation</h2>
            <Link href="/dashboard/settings" className="text-sm text-green-600 hover:underline">
              Modifier
            </Link>
          </div>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500">Nom</dt>
              <dd className="text-gray-900 font-medium">{activeExploitation.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">SIRET</dt>
              <dd className="text-gray-900 font-medium">{activeExploitation.siret || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Numero Bio</dt>
              <dd className="text-gray-900 font-medium">{activeExploitation.num_agrement_bio || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Statut Agence Bio</dt>
              <dd>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  activeExploitation.agence_bio_verified
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {activeExploitation.agence_bio_verified ? 'Verifie' : 'Non verifie'}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Certification Bio</h2>
          {activeExploitation.organisme_certificateur ? (
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-gray-500">Organisme</dt>
                <dd className="text-gray-900 font-medium">{activeExploitation.organisme_certificateur}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Date certification</dt>
                <dd className="text-gray-900 font-medium">
                  {activeExploitation.date_certification
                    ? new Date(activeExploitation.date_certification).toLocaleDateString('fr-FR')
                    : '-'}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500 text-sm mb-3">
                Ajoutez les informations de votre certification bio.
              </p>
              <Link href="/dashboard/settings" className="text-sm text-green-600 hover:underline">
                Configurer
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
