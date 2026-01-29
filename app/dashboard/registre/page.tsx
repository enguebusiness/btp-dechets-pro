'use client'

import { useEffect, useState, useCallback } from 'react'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'

interface RegistreEntry {
  id: string
  date: string
  type: 'entree' | 'sortie'
  description: string
  fournisseur_acheteur: string | null
  quantite: number
  unite: string
  numero_lot: string | null
  certifie_bio: boolean
  parcelle: string | null
  source: 'intrant' | 'recolte'
}

interface IntrantRecord {
  id: string
  date_achat: string
  produit_nom: string
  fournisseur: string | null
  quantite: number
  unite: string
  lot_number: string | null
  est_bio: boolean
  parcelle_id: string | null
}

interface RecolteRecord {
  id: string
  date_recolte: string
  culture: string
  variete: string | null
  acheteur: string | null
  quantite: number
  unite: string
  numero_lot_sortie: string | null
  certifie_bio: boolean
  parcelle_id: string | null
}

export default function RegistrePage() {
  const { activeExploitation } = useExploitation()
  const [entries, setEntries] = useState<RegistreEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'entree' | 'sortie'>('all')
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

      const [intrantsRes, recoltesRes, parcellesRes] = await Promise.all([
        supabase
          .from('intrants')
          .select('*')
          .eq('exploitation_id', activeExploitation.id)
          .gte('date_achat', periode.debut)
          .lte('date_achat', periode.fin),
        supabase
          .from('recoltes')
          .select('*')
          .eq('exploitation_id', activeExploitation.id)
          .gte('date_recolte', periode.debut)
          .lte('date_recolte', periode.fin),
        supabase
          .from('parcelles')
          .select('id, nom')
          .eq('exploitation_id', activeExploitation.id),
      ])

      const parcelles = parcellesRes.data || []
      const getParcelleName = (id: string | null) => {
        if (!id) return null
        const parcel = parcelles.find((p: { id: string; nom: string }) => p.id === id)
        return parcel?.nom || null
      }

      const registreEntries: RegistreEntry[] = []

      // Ajouter les intrants (entrees)
      if (intrantsRes.data) {
        (intrantsRes.data as IntrantRecord[]).forEach((intrant: IntrantRecord) => {
          registreEntries.push({
            id: intrant.id,
            date: intrant.date_achat,
            type: 'entree',
            description: intrant.produit_nom,
            fournisseur_acheteur: intrant.fournisseur,
            quantite: intrant.quantite,
            unite: intrant.unite,
            numero_lot: intrant.lot_number,
            certifie_bio: intrant.est_bio,
            parcelle: getParcelleName(intrant.parcelle_id),
            source: 'intrant',
          })
        })
      }

      // Ajouter les recoltes (sorties)
      if (recoltesRes.data) {
        (recoltesRes.data as RecolteRecord[]).forEach((recolte: RecolteRecord) => {
          registreEntries.push({
            id: recolte.id,
            date: recolte.date_recolte,
            type: 'sortie',
            description: recolte.culture + (recolte.variete ? ` - ${recolte.variete}` : ''),
            fournisseur_acheteur: recolte.acheteur,
            quantite: recolte.quantite,
            unite: recolte.unite,
            numero_lot: recolte.numero_lot_sortie,
            certifie_bio: recolte.certifie_bio,
            parcelle: getParcelleName(recolte.parcelle_id),
            source: 'recolte',
          })
        })
      }

      // Trier par date decroissante
      registreEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      setEntries(registreEntries)
    } catch (err) {
      console.error('Erreur:', err)
    } finally {
      setLoading(false)
    }
  }, [activeExploitation, supabase, periode])

  useEffect(() => {
    loadRegistre()
  }, [loadRegistre])

  const filteredEntries = entries
    .filter(e => filter === 'all' || e.type === filter)
    .filter(e =>
      e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.fournisseur_acheteur?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (e.numero_lot?.toLowerCase().includes(searchTerm.toLowerCase()))
    )

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
          <h1 className="text-2xl font-bold text-gray-900">Registre</h1>
          <p className="text-gray-600">Tracabilite complete des entrees et sorties</p>
        </div>
        <button className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exporter
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Rechercher..."
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
            {(['all', 'entree', 'sortie'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === type
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type === 'all' ? 'Tous' : type === 'entree' ? 'Entrees' : 'Sorties'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Registre vide</h3>
          <p className="text-gray-500">
            {searchTerm || filter !== 'all' ? 'Aucun resultat pour cette recherche' : 'Ajoutez des intrants ou enregistrez des recoltes'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur/Acheteur</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantite</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Lot</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parcelle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredEntries.map((entry) => (
                  <tr key={`${entry.source}-${entry.id}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Date(entry.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        entry.type === 'entree'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {entry.type === 'entree' ? 'Entree' : 'Sortie'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{entry.description}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {entry.fournisseur_acheteur || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {entry.quantite.toLocaleString()} {entry.unite}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {entry.numero_lot || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {entry.parcelle || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {entry.certifie_bio ? (
                        <span className="inline-flex items-center text-green-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination / Info */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              {filteredEntries.length} enregistrement(s) sur la periode
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
