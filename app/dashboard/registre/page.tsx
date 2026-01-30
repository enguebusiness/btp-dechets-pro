'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'
import { getConformityBadge } from '@/lib/gemini'
import type { Intrant } from '@/types/database'

type FilterType = 'all' | 'conforme' | 'attention' | 'non_conforme'

export default function RegistrePage() {
  const { activeExploitation } = useExploitation()
  const [intrants, setIntrants] = useState<Intrant[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [periode, setPeriode] = useState({
    debut: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    fin: new Date().toISOString().split('T')[0],
  })
  const supabase = createClient()

  const loadRegistre = useCallback(async () => {
    if (!activeExploitation) return

    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('intrants')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .gte('date_achat', periode.debut)
        .lte('date_achat', periode.fin)
        .order('date_achat', { ascending: false })

      if (error && error.code !== '42P01') throw error

      setIntrants(data || [])
    } catch (err) {
      console.error('Erreur:', err)
    } finally {
      setLoading(false)
    }
  }, [activeExploitation, supabase, periode])

  useEffect(() => {
    loadRegistre()
  }, [loadRegistre])

  const filteredIntrants = intrants
    .filter(i => filter === 'all' || i.conformite_status === filter)
    .filter(i =>
      i.produit_nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.fournisseur?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (i.lot_number?.toLowerCase().includes(searchTerm.toLowerCase()))
    )

  // Calcul des statistiques
  const stats = {
    total: intrants.length,
    conformes: intrants.filter(i => i.conformite_status === 'conforme').length,
    attention: intrants.filter(i => i.conformite_status === 'attention').length,
    non_conformes: intrants.filter(i => i.conformite_status === 'non_conforme').length,
  }

  const exportCSV = () => {
    const headers = ['Date', 'Produit', 'Fournisseur', 'Quantite', 'Unite', 'N° Lot', 'Bio', 'Conformite', 'Note IA']
    const rows = filteredIntrants.map(i => [
      new Date(i.date_achat).toLocaleDateString('fr-FR'),
      i.produit_nom,
      i.fournisseur || '',
      i.quantite.toString(),
      i.unite,
      i.lot_number || '',
      i.est_bio ? 'Oui' : 'Non',
      i.conformite_status || 'Non evalue',
      i.note_ia || '',
    ])

    const csv = [headers, ...rows].map(row => row.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registre-achats-${activeExploitation?.name}-${periode.debut}-${periode.fin}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Selectionnez une exploitation pour voir le registre.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registre des Achats</h1>
          <p className="text-gray-600">Tracabilite et conformite de vos intrants Bio</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/mangetout"
            className="inline-flex items-center px-4 py-2 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Scanner facture
          </Link>
          <button
            onClick={exportCSV}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exporter CSV
          </button>
        </div>
      </div>

      {/* Statistiques de conformite */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total achats</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
          <p className="text-sm text-gray-500">Conformes</p>
          <p className="text-2xl font-bold text-green-600">{stats.conformes}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-orange-100">
          <p className="text-sm text-gray-500">Attention</p>
          <p className="text-2xl font-bold text-orange-600">{stats.attention}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-red-100">
          <p className="text-sm text-gray-500">Non conformes</p>
          <p className="text-2xl font-bold text-red-600">{stats.non_conformes}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Rechercher produit, fournisseur, lot..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-4">
            <input
              type="date"
              value={periode.debut}
              onChange={(e) => setPeriode({ ...periode, debut: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <input
              type="date"
              value={periode.fin}
              onChange={(e) => setPeriode({ ...periode, fin: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'conforme', 'attention', 'non_conforme'] as FilterType[]).map((type) => {
              const badge = type === 'all' ? null : getConformityBadge(type)
              return (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    filter === type
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type === 'all' ? 'Tous' : `${badge?.emoji} ${badge?.label}`}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredIntrants.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Registre vide</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || filter !== 'all' ? 'Aucun resultat pour cette recherche' : 'Scannez vos factures pour alimenter le registre'}
          </p>
          <Link href="/dashboard/mangetout" className="text-green-600 hover:underline">
            Scanner une facture
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantite</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Lot</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conformite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredIntrants.map((intrant) => {
                  const badge = getConformityBadge(intrant.conformite_status)
                  return (
                    <tr key={intrant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(intrant.date_achat).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{intrant.produit_nom}</p>
                        {intrant.note_ia && (
                          <p className="text-xs text-gray-500 mt-1 max-w-xs truncate" title={intrant.note_ia}>
                            {intrant.note_ia}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {intrant.fournisseur || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {intrant.quantite.toLocaleString()} {intrant.unite}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {intrant.lot_number || '-'}
                      </td>
                      <td className="px-6 py-4">
                        {intrant.est_bio ? (
                          <span className="inline-flex items-center text-green-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${badge.bgColor} ${badge.color}`}>
                          {badge.emoji} {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Info */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              {filteredIntrants.length} enregistrement(s) sur la periode
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
