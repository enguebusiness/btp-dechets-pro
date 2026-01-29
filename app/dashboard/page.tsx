'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useExploitation } from '@/contexts/ExploitationContext'

interface DashboardStats {
  parcelles: number
  intrants: number
  recoltes: number
  documents: number
  certificatsExpires: number
}

export default function DashboardPage() {
  const { activeExploitation, loading: exploitationLoading } = useExploitation()
  const [stats, setStats] = useState<DashboardStats>({
    parcelles: 0,
    intrants: 0,
    recoltes: 0,
    documents: 0,
    certificatsExpires: 0,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadStats = async () => {
      if (!activeExploitation) {
        setLoading(false)
        return
      }

      try {
        // Charger les statistiques en parallèle
        const [parcellesRes, intrantsRes, recoltesRes, documentsRes, certificatsRes] = await Promise.all([
          supabase.from('parcelles').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id),
          supabase.from('intrants').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id),
          supabase.from('recoltes').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id),
          supabase.from('documents_storage').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id),
          supabase.from('certificats_fournisseurs').select('id', { count: 'exact', head: true }).eq('exploitation_id', activeExploitation.id).eq('statut', 'expire'),
        ])

        setStats({
          parcelles: parcellesRes.count || 0,
          intrants: intrantsRes.count || 0,
          recoltes: recoltesRes.count || 0,
          documents: documentsRes.count || 0,
          certificatsExpires: certificatsRes.count || 0,
        })
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Bienvenue sur Bio-Audit</h2>
        <p className="text-gray-600 mb-6">
          Commencez par creer votre premiere exploitation agricole pour acceder a toutes les fonctionnalites.
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

  const quickActions = [
    { href: '/dashboard/mangetout', label: 'Scanner une facture', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'bg-blue-500' },
    { href: '/dashboard/intrants', label: 'Ajouter un intrant', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', color: 'bg-green-500' },
    { href: '/dashboard/recoltes', label: 'Enregistrer une recolte', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945', color: 'bg-amber-500' },
    { href: '/dashboard/certificats', label: 'Gerer les certificats', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0', color: 'bg-purple-500' },
  ]

  const statCards = [
    { label: 'Parcelles', value: stats.parcelles, href: '/dashboard/parcelles', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7', color: 'text-green-600 bg-green-100' },
    { label: 'Intrants', value: stats.intrants, href: '/dashboard/intrants', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', color: 'text-blue-600 bg-blue-100' },
    { label: 'Recoltes', value: stats.recoltes, href: '/dashboard/recoltes', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064', color: 'text-amber-600 bg-amber-100' },
    { label: 'Documents', value: stats.documents, href: '/dashboard/documents', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4', color: 'text-purple-600 bg-purple-100' },
  ]

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-600">{activeExploitation.name}</p>
        </div>
        {activeExploitation.subscription_status !== 'active' && (
          <Link
            href="/dashboard/settings?tab=abonnement"
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Passer a Pro
          </Link>
        )}
      </div>

      {/* Alertes */}
      {stats.certificatsExpires > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">Attention</h3>
            <p className="text-sm text-red-700 mt-1">
              {stats.certificatsExpires} certificat{stats.certificatsExpires > 1 ? 's' : ''} fournisseur{stats.certificatsExpires > 1 ? 's' : ''} expire{stats.certificatsExpires > 1 ? 's' : ''}.
              <Link href="/dashboard/certificats" className="ml-1 underline hover:no-underline">
                Voir les details
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={stat.icon} />
                </svg>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Actions rapides */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions rapides</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors text-center"
            >
              <div className={`w-10 h-10 ${action.color} rounded-lg flex items-center justify-center mb-2`}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Informations de l'exploitation */}
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
              <dt className="text-gray-500">Surface totale</dt>
              <dd className="text-gray-900 font-medium">
                {activeExploitation.surface_totale ? `${activeExploitation.surface_totale} ha` : '-'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Abonnement</dt>
              <dd>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  activeExploitation.subscription_status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {activeExploitation.subscription_status === 'active' ? 'Pro' : 'Gratuit'}
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
                Ajoutez les informations de votre certification bio pour un suivi complet.
              </p>
              <Link
                href="/dashboard/settings"
                className="text-sm text-green-600 hover:underline"
              >
                Configurer la certification
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
