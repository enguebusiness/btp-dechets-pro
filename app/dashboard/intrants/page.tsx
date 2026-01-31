'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'
import type { Intrant, IntrantFormData } from '@/types/database'

type FilterType = 'all' | 'semence' | 'engrais' | 'phytosanitaire' | 'amendement' | 'autre'

export default function IntrantsPage() {
  const { activeExploitation } = useExploitation()
  const [intrants, setIntrants] = useState<Intrant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingIntrant, setEditingIntrant] = useState<Intrant | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const supabase = createClient()

  const [formData, setFormData] = useState<IntrantFormData>({
    parcelle_id: '',
    produit_nom: '',
    fournisseur: '',
    lot_number: '',
    quantite: 0,
    unite: 'kg',
    date_achat: new Date().toISOString().split('T')[0],
    date_utilisation: '',
    prix_unitaire: undefined,
    prix_total: undefined,
    est_bio: false,
    numero_certificat: '',
    type_intrant: 'autre',
    notes: '',
  })

  const loadData = useCallback(async () => {
    if (!activeExploitation) return

    try {
      setLoading(true)

      const { data, error: intrantsError } = await supabase
        .from('intrants')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .order('date_achat', { ascending: false })

      if (intrantsError && intrantsError.code !== '42P01') throw intrantsError

      setIntrants(data || [])
    } catch (err) {
      console.error('Erreur:', err)
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [activeExploitation, supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeExploitation) return

    setError(null)
    setSuccess(null)

    try {
      const dataToSave = {
        ...formData,
        parcelle_id: formData.parcelle_id || null,
        date_utilisation: formData.date_utilisation || null,
        prix_unitaire: formData.prix_unitaire || null,
        prix_total: formData.prix_total || null,
        numero_certificat: formData.numero_certificat || null,
        notes: formData.notes || null,
      }

      if (editingIntrant) {
        const { error: updateError } = await supabase
          .from('intrants')
          .update({
            ...dataToSave,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingIntrant.id)

        if (updateError) throw updateError
        setSuccess('Intrant modifie')
      } else {
        const { error: insertError } = await supabase
          .from('intrants')
          .insert({
            exploitation_id: activeExploitation.id,
            ...dataToSave,
          })

        if (insertError) throw insertError
        setSuccess('Intrant ajoute')
      }

      setShowForm(false)
      setEditingIntrant(null)
      resetForm()
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    }
  }

  const handleEdit = (intrant: Intrant) => {
    setEditingIntrant(intrant)
    setFormData({
      parcelle_id: intrant.parcelle_id || '',
      produit_nom: intrant.produit_nom,
      fournisseur: intrant.fournisseur || '',
      lot_number: intrant.lot_number || '',
      quantite: intrant.quantite,
      unite: intrant.unite,
      date_achat: intrant.date_achat,
      date_utilisation: intrant.date_utilisation || '',
      prix_unitaire: intrant.prix_unitaire || undefined,
      prix_total: intrant.prix_total || undefined,
      est_bio: intrant.est_bio,
      numero_certificat: intrant.numero_certificat || '',
      type_intrant: intrant.type_intrant,
      notes: intrant.notes || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (intrant: Intrant) => {
    if (!confirm(`Supprimer "${intrant.produit_nom}" ?`)) return

    try {
      const { error: deleteError } = await supabase
        .from('intrants')
        .delete()
        .eq('id', intrant.id)

      if (deleteError) throw deleteError
      setSuccess('Intrant supprime')
      loadData()
    } catch (err) {
      setError('Erreur lors de la suppression')
    }
  }

  const resetForm = () => {
    setFormData({
      parcelle_id: '',
      produit_nom: '',
      fournisseur: '',
      lot_number: '',
      quantite: 0,
      unite: 'kg',
      date_achat: new Date().toISOString().split('T')[0],
      date_utilisation: '',
      prix_unitaire: undefined,
      prix_total: undefined,
      est_bio: false,
      numero_certificat: '',
      type_intrant: 'autre',
      notes: '',
    })
  }

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      semence: 'Semence',
      engrais: 'Engrais',
      phytosanitaire: 'Phyto',
      amendement: 'Amendement',
      autre: 'Autre',
    }
    return labels[type] || type
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      semence: 'bg-emerald-100 text-emerald-800',
      engrais: 'bg-blue-100 text-blue-800',
      phytosanitaire: 'bg-red-100 text-red-800',
      amendement: 'bg-amber-100 text-amber-800',
      autre: 'bg-gray-100 text-gray-800',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  const filteredIntrants = intrants
    .filter(i => filter === 'all' || i.type_intrant === filter)
    .filter(i =>
      i.produit_nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.fournisseur?.toLowerCase().includes(searchTerm.toLowerCase()))
    )

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Selectionnez une exploitation pour voir les intrants.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intrants</h1>
          <p className="text-gray-600">Gerez vos semences, engrais et produits phytosanitaires</p>
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
            onClick={() => {
              setEditingIntrant(null)
              resetForm()
              setShowForm(true)
            }}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Ajouter
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">{success}</div>}

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(['all', 'semence', 'engrais', 'phytosanitaire', 'amendement', 'autre'] as FilterType[]).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === type
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type === 'all' ? 'Tous' : getTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingIntrant ? 'Modifier l\'intrant' : 'Nouvel intrant'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du produit *</label>
                <input
                  type="text"
                  required
                  value={formData.produit_nom}
                  onChange={(e) => setFormData({ ...formData, produit_nom: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  value={formData.type_intrant}
                  onChange={(e) => setFormData({ ...formData, type_intrant: e.target.value as IntrantFormData['type_intrant'] })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="semence">Semence</option>
                  <option value="engrais">Engrais</option>
                  <option value="phytosanitaire">Phytosanitaire</option>
                  <option value="amendement">Amendement</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur</label>
                <input
                  type="text"
                  value={formData.fournisseur}
                  onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° Lot</label>
                <input
                  type="text"
                  value={formData.lot_number}
                  onChange={(e) => setFormData({ ...formData, lot_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantite *</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={formData.quantite || ''}
                  onChange={(e) => setFormData({ ...formData, quantite: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unite *</label>
                <select
                  value={formData.unite}
                  onChange={(e) => setFormData({ ...formData, unite: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                  <option value="unite">unité</option>
                  <option value="sac">sac</option>
                  <option value="t">tonne</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;achat *</label>
                <input
                  type="date"
                  required
                  value={formData.date_achat}
                  onChange={(e) => setFormData({ ...formData, date_achat: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;utilisation</label>
                <input
                  type="date"
                  value={formData.date_utilisation}
                  onChange={(e) => setFormData({ ...formData, date_utilisation: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prix total (EUR)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.prix_total || ''}
                  onChange={(e) => setFormData({ ...formData, prix_total: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center pt-6">
                <input
                  type="checkbox"
                  id="est_bio"
                  checked={formData.est_bio}
                  onChange={(e) => setFormData({ ...formData, est_bio: e.target.checked })}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <label htmlFor="est_bio" className="ml-2 text-sm text-gray-700">
                  Certifie Bio
                </label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingIntrant(null)
                  resetForm()
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                {editingIntrant ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredIntrants.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Aucun intrant</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || filter !== 'all' ? 'Aucun resultat pour cette recherche' : 'Ajoutez vos premiers intrants'}
          </p>
          <Link
            href="/dashboard/mangetout"
            className="inline-flex items-center text-green-600 hover:underline"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Ou scannez une facture
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantite</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bio</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredIntrants.map((intrant) => (
                  <tr key={intrant.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{intrant.produit_nom}</p>
                      {intrant.fournisseur && (
                        <p className="text-sm text-gray-500">{intrant.fournisseur}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(intrant.type_intrant)}`}>
                        {getTypeLabel(intrant.type_intrant)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-900">
                      {intrant.quantite} {intrant.unite}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(intrant.date_achat).toLocaleDateString('fr-FR')}
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
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleEdit(intrant)} className="p-2 text-gray-400 hover:text-green-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(intrant)} className="p-2 text-gray-400 hover:text-red-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
