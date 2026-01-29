'use client'

import { useEffect, useState, useCallback } from 'react'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'

interface IntrantData {
  id: string
  unite: string
  quantite: number
  prix_total: number | null
  type_intrant: string
  est_bio?: boolean
  certifie_bio?: boolean
}

interface RecolteData {
  id: string
  unite: string
  quantite: number
  prix_vente: number | null
  culture: string
  certifie_bio: boolean
}

interface BilanStats {
  entrees: {
    total_kg: number
    total_valeur: number
    par_type: Record<string, number>
    bio_count: number
    non_bio_count: number
  }
  sorties: {
    total_kg: number
    total_valeur: number
    par_culture: Record<string, number>
    bio_count: number
  }
  conformite: {
    pourcentage_bio: number
    alertes: string[]
  }
}

export default function BilanPage() {
  const { activeExploitation } = useExploitation()
  const [stats, setStats] = useState<BilanStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [periode, setPeriode] = useState({
    debut: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    fin: new Date().toISOString().split('T')[0],
  })
  const supabase = createClient()

  const loadBilan = useCallback(async () => {
    if (!activeExploitation) return

    try {
      setLoading(true)

      // Charger les intrants
      const { data: intrants, error: intrantsError } = await supabase
        .from('intrants')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .gte('date_achat', periode.debut)
        .lte('date_achat', periode.fin)

      // Charger les recoltes
      const { data: recoltes, error: recoltesError } = await supabase
        .from('recoltes')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .gte('date_recolte', periode.debut)
        .lte('date_recolte', periode.fin)

      if (intrantsError && intrantsError.code !== '42P01') throw intrantsError
      if (recoltesError && recoltesError.code !== '42P01') throw recoltesError

      const intrantsList: IntrantData[] = (intrants || []) as IntrantData[]
      const recoltesList: RecolteData[] = (recoltes || []) as RecolteData[]

      // Calculs des entrées
      const entrees_total_kg = intrantsList.reduce((acc: number, i: IntrantData) => {
        if (i.unite === 'kg') return acc + i.quantite
        if (i.unite === 't') return acc + (i.quantite * 1000)
        if (i.unite === 'L') return acc + i.quantite // approximation
        return acc + i.quantite
      }, 0)

      const entrees_total_valeur = intrantsList.reduce((acc: number, i: IntrantData) => acc + (i.prix_total || 0), 0)

      const par_type: Record<string, number> = {}
      intrantsList.forEach((i: IntrantData) => {
        par_type[i.type_intrant] = (par_type[i.type_intrant] || 0) + i.quantite
      })

      const bio_count = intrantsList.filter((i: IntrantData) => i.est_bio || i.certifie_bio).length
      const non_bio_count = intrantsList.filter((i: IntrantData) => !i.est_bio && !i.certifie_bio).length

      // Calculs des sorties
      const sorties_total_kg = recoltesList.reduce((acc: number, r: RecolteData) => {
        if (r.unite === 'kg') return acc + r.quantite
        if (r.unite === 't') return acc + (r.quantite * 1000)
        if (r.unite === 'q') return acc + (r.quantite * 100)
        return acc + r.quantite
      }, 0)

      const sorties_total_valeur = recoltesList.reduce((acc: number, r: RecolteData) => acc + (r.prix_vente || 0), 0)

      const par_culture: Record<string, number> = {}
      recoltesList.forEach((r: RecolteData) => {
        par_culture[r.culture] = (par_culture[r.culture] || 0) + r.quantite
      })

      const sorties_bio_count = recoltesList.filter((r: RecolteData) => r.certifie_bio).length

      // Conformite
      const total_intrants = bio_count + non_bio_count
      const pourcentage_bio = total_intrants > 0 ? (bio_count / total_intrants) * 100 : 100

      const alertes: string[] = []
      if (non_bio_count > 0) {
        alertes.push(`${non_bio_count} intrant(s) non certifie(s) bio`)
      }
      if (pourcentage_bio < 95) {
        alertes.push(`Taux de conformite bio inferieur a 95% (${pourcentage_bio.toFixed(1)}%)`)
      }

      setStats({
        entrees: {
          total_kg: entrees_total_kg,
          total_valeur: entrees_total_valeur,
          par_type,
          bio_count,
          non_bio_count,
        },
        sorties: {
          total_kg: sorties_total_kg,
          total_valeur: sorties_total_valeur,
          par_culture,
          bio_count: sorties_bio_count,
        },
        conformite: {
          pourcentage_bio,
          alertes,
        },
      })
    } catch (err) {
      console.error('Erreur:', err)
    } finally {
      setLoading(false)
    }
  }, [activeExploitation, supabase, periode])

  useEffect(() => {
    loadBilan()
  }, [loadBilan])

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Selectionnez une exploitation pour voir le bilan matiere.</p>
      </div>
    )
  }

  const formatNumber = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bilan Matiere</h1>
          <p className="text-gray-600">Vue d&apos;ensemble des flux d&apos;intrants et de productions</p>
        </div>
      </div>

      {/* Filtre periode */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date debut</label>
            <input
              type="date"
              value={periode.debut}
              onChange={(e) => setPeriode({ ...periode, debut: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date fin</label>
            <input
              type="date"
              value={periode.fin}
              onChange={(e) => setPeriode({ ...periode, fin: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={loadBilan}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Actualiser
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : stats ? (
        <>
          {/* Alertes conformite */}
          {stats.conformite.alertes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="text-sm font-medium text-amber-800">Points d&apos;attention</h3>
                  <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                    {stats.conformite.alertes.map((alerte, i) => (
                      <li key={i}>{alerte}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Statistiques globales */}
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="text-sm text-gray-500">Entrees (intrants)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(stats.entrees.total_kg)} kg</p>
              <p className="text-sm text-gray-600 mt-1">{formatNumber(stats.entrees.total_valeur)} EUR</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="text-sm text-gray-500">Sorties (recoltes)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(stats.sorties.total_kg)} kg</p>
              <p className="text-sm text-gray-600 mt-1">{formatNumber(stats.sorties.total_valeur)} EUR</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="text-sm text-gray-500">Taux conformite bio</p>
              <p className={`text-2xl font-bold mt-1 ${stats.conformite.pourcentage_bio >= 95 ? 'text-green-600' : 'text-amber-600'}`}>
                {formatNumber(stats.conformite.pourcentage_bio)}%
              </p>
              <p className="text-sm text-gray-600 mt-1">{stats.entrees.bio_count} bio / {stats.entrees.bio_count + stats.entrees.non_bio_count}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="text-sm text-gray-500">Ratio E/S</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats.sorties.total_kg > 0 ? formatNumber(stats.entrees.total_kg / stats.sorties.total_kg) : 'N/A'}
              </p>
              <p className="text-sm text-gray-600 mt-1">kg intrant / kg recolte</p>
            </div>
          </div>

          {/* Details */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Entrees par type */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Entrees par type d&apos;intrant</h3>
              {Object.keys(stats.entrees.par_type).length === 0 ? (
                <p className="text-gray-500 text-center py-8">Aucune donnee</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.entrees.par_type).map(([type, quantite]) => {
                    const total = Object.values(stats.entrees.par_type).reduce((a, b) => a + b, 0)
                    const percent = total > 0 ? (quantite / total) * 100 : 0
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize text-gray-700">{type}</span>
                          <span className="font-medium">{formatNumber(quantite)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                          <div
                            className="h-2 bg-green-500 rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Sorties par culture */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Sorties par culture</h3>
              {Object.keys(stats.sorties.par_culture).length === 0 ? (
                <p className="text-gray-500 text-center py-8">Aucune donnee</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.sorties.par_culture).map(([culture, quantite]) => {
                    const total = Object.values(stats.sorties.par_culture).reduce((a, b) => a + b, 0)
                    const percent = total > 0 ? (quantite / total) * 100 : 0
                    return (
                      <div key={culture}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{culture}</span>
                          <span className="font-medium">{formatNumber(quantite)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                          <div
                            className="h-2 bg-amber-500 rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Export */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Exporter le bilan</h3>
                <p className="text-sm text-gray-600">Generez un rapport PDF ou Excel pour vos controles</p>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                  Export Excel
                </button>
                <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                  Export PDF
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">Aucune donnee pour cette periode</p>
        </div>
      )}
    </div>
  )
}
