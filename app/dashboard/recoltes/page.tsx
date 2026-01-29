'use client'

import { useEffect, useState, useCallback } from 'react'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'
import type { Recolte, Parcelle } from '@/types/database'

export default function RecoltesPage() {
  const { activeExploitation } = useExploitation()
  const [recoltes, setRecoltes] = useState<Recolte[]>([])
  const [parcelles, setParcelles] = useState<Parcelle[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRecolte, setEditingRecolte] = useState<Recolte | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const supabase = createClient()

  const [formData, setFormData] = useState({
    parcelle_id: '',
    culture: '',
    variete: '',
    date_recolte: new Date().toISOString().split('T')[0],
    quantite: 0,
    unite: 'kg',
    rendement: undefined as number | undefined,
    qualite: '',
    destination: '',
    prix_vente: undefined as number | undefined,
    acheteur: '',
    numero_lot_sortie: '',
    certifie_bio: true,
    notes: '',
  })

  const loadData = useCallback(async () => {
    if (!activeExploitation) return

    try {
      setLoading(true)

      const [recoltesRes, parcellesRes] = await Promise.all([
        supabase
          .from('recoltes')
          .select('*')
          .eq('exploitation_id', activeExploitation.id)
          .order('date_recolte', { ascending: false }),
        supabase
          .from('parcelles')
          .select('*')
          .eq('exploitation_id', activeExploitation.id),
      ])

      if (recoltesRes.error && recoltesRes.error.code !== '42P01') throw recoltesRes.error
      if (parcellesRes.error && parcellesRes.error.code !== '42P01') throw parcellesRes.error

      setRecoltes(recoltesRes.data || [])
      setParcelles(parcellesRes.data || [])
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
        parcelle_id: formData.parcelle_id,
        culture: formData.culture,
        variete: formData.variete || null,
        date_recolte: formData.date_recolte,
        quantite: formData.quantite,
        unite: formData.unite,
        rendement: formData.rendement || null,
        qualite: formData.qualite || null,
        destination: formData.destination || null,
        prix_vente: formData.prix_vente || null,
        acheteur: formData.acheteur || null,
        numero_lot_sortie: formData.numero_lot_sortie || null,
        certifie_bio: formData.certifie_bio,
        notes: formData.notes || null,
      }

      if (editingRecolte) {
        const { error: updateError } = await supabase
          .from('recoltes')
          .update({
            ...dataToSave,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingRecolte.id)

        if (updateError) throw updateError
        setSuccess('Recolte modifiee')
      } else {
        const { error: insertError } = await supabase
          .from('recoltes')
          .insert({
            exploitation_id: activeExploitation.id,
            ...dataToSave,
          })

        if (insertError) throw insertError
        setSuccess('Recolte ajoutee')
      }

      setShowForm(false)
      setEditingRecolte(null)
      resetForm()
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    }
  }

  const handleEdit = (recolte: Recolte) => {
    setEditingRecolte(recolte)
    setFormData({
      parcelle_id: recolte.parcelle_id,
      culture: recolte.culture,
      variete: recolte.variete || '',
      date_recolte: recolte.date_recolte,
      quantite: recolte.quantite,
      unite: recolte.unite,
      rendement: recolte.rendement || undefined,
      qualite: recolte.qualite || '',
      destination: recolte.destination || '',
      prix_vente: recolte.prix_vente || undefined,
      acheteur: recolte.acheteur || '',
      numero_lot_sortie: recolte.numero_lot_sortie || '',
      certifie_bio: recolte.certifie_bio,
      notes: recolte.notes || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (recolte: Recolte) => {
    if (!confirm(`Supprimer cette recolte de ${recolte.culture} ?`)) return

    try {
      const { error: deleteError } = await supabase
        .from('recoltes')
        .delete()
        .eq('id', recolte.id)

      if (deleteError) throw deleteError
      setSuccess('Recolte supprimee')
      loadData()
    } catch (err) {
      setError('Erreur lors de la suppression')
    }
  }

  const resetForm = () => {
    setFormData({
      parcelle_id: '',
      culture: '',
      variete: '',
      date_recolte: new Date().toISOString().split('T')[0],
      quantite: 0,
      unite: 'kg',
      rendement: undefined,
      qualite: '',
      destination: '',
      prix_vente: undefined,
      acheteur: '',
      numero_lot_sortie: '',
      certifie_bio: true,
      notes: '',
    })
  }

  const getParcelleName = (id: string) => {
    const p = parcelles.find(p => p.id === id)
    return p?.nom || 'N/A'
  }

  const totalQuantite = recoltes.reduce((acc, r) => acc + r.quantite, 0)

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Selectionnez une exploitation pour voir les recoltes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recoltes</h1>
          <p className="text-gray-600">Enregistrez vos productions ({totalQuantite.toLocaleString()} kg total)</p>
        </div>
        <button
          onClick={() => {
            setEditingRecolte(null)
            resetForm()
            setShowForm(true)
          }}
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Nouvelle recolte
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">{success}</div>}

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingRecolte ? 'Modifier la recolte' : 'Nouvelle recolte'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parcelle *</label>
                <select
                  required
                  value={formData.parcelle_id}
                  onChange={(e) => setFormData({ ...formData, parcelle_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Selectionner...</option>
                  {parcelles.map((p) => (
                    <option key={p.id} value={p.id}>{p.nom} ({p.surface} ha)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Culture *</label>
                <input
                  type="text"
                  required
                  value={formData.culture}
                  onChange={(e) => setFormData({ ...formData, culture: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Ex: Ble tendre"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variete</label>
                <input
                  type="text"
                  value={formData.variete}
                  onChange={(e) => setFormData({ ...formData, variete: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date de recolte *</label>
                <input
                  type="date"
                  required
                  value={formData.date_recolte}
                  onChange={(e) => setFormData({ ...formData, date_recolte: e.target.value })}
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
                  <option value="t">tonne</option>
                  <option value="q">quintal</option>
                  <option value="unite">unité</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rendement (q/ha)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.rendement || ''}
                  onChange={(e) => setFormData({ ...formData, rendement: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° Lot sortie</label>
                <input
                  type="text"
                  value={formData.numero_lot_sortie}
                  onChange={(e) => setFormData({ ...formData, numero_lot_sortie: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                <input
                  type="text"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Ex: Cooperative, moulin..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Acheteur</label>
                <input
                  type="text"
                  value={formData.acheteur}
                  onChange={(e) => setFormData({ ...formData, acheteur: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prix de vente (EUR)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.prix_vente || ''}
                  onChange={(e) => setFormData({ ...formData, prix_vente: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center pt-6">
                <input
                  type="checkbox"
                  id="certifie_bio_recolte"
                  checked={formData.certifie_bio}
                  onChange={(e) => setFormData({ ...formData, certifie_bio: e.target.checked })}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <label htmlFor="certifie_bio_recolte" className="ml-2 text-sm text-gray-700">
                  Recolte Bio
                </label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingRecolte(null)
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
                {editingRecolte ? 'Modifier' : 'Ajouter'}
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
      ) : recoltes.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Aucune recolte</h3>
          <p className="text-gray-500">Enregistrez votre premiere recolte</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Culture</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parcelle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantite</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bio</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recoltes.map((recolte) => (
                  <tr key={recolte.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{recolte.culture}</p>
                      {recolte.variete && <p className="text-sm text-gray-500">{recolte.variete}</p>}
                    </td>
                    <td className="px-6 py-4 text-gray-900">{getParcelleName(recolte.parcelle_id)}</td>
                    <td className="px-6 py-4 text-gray-900">
                      {recolte.quantite.toLocaleString()} {recolte.unite}
                      {recolte.rendement && (
                        <span className="text-sm text-gray-500 block">{recolte.rendement} q/ha</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(recolte.date_recolte).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4">
                      {recolte.certifie_bio ? (
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
                      <button onClick={() => handleEdit(recolte)} className="p-2 text-gray-400 hover:text-green-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(recolte)} className="p-2 text-gray-400 hover:text-red-600">
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
