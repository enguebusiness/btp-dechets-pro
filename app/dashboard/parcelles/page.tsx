'use client'

import { useEffect, useState, useCallback } from 'react'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'
import type { Parcelle, ParcelleFormData } from '@/types/database'

export default function ParcellesPage() {
  const { activeExploitation } = useExploitation()
  const [parcelles, setParcelles] = useState<Parcelle[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingParcelle, setEditingParcelle] = useState<Parcelle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const supabase = createClient()

  const [formData, setFormData] = useState<ParcelleFormData>({
    nom: '',
    surface: 0,
    culture_actuelle: '',
    type_sol: '',
    irrigation: false,
    mode_production: 'bio',
    date_debut_conversion: '',
    coordonnees_gps: '',
  })

  const loadParcelles = useCallback(async () => {
    if (!activeExploitation) return

    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('parcelles')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .order('nom', { ascending: true })

      if (fetchError) {
        if (fetchError.code !== '42P01') throw fetchError
        setParcelles([])
      } else {
        setParcelles(data || [])
      }
    } catch (err) {
      console.error('Erreur:', err)
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [activeExploitation, supabase])

  useEffect(() => {
    loadParcelles()
  }, [loadParcelles])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeExploitation) return

    setError(null)
    setSuccess(null)

    try {
      if (editingParcelle) {
        const { error: updateError } = await supabase
          .from('parcelles')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingParcelle.id)

        if (updateError) throw updateError
        setSuccess('Parcelle modifiee')
      } else {
        const { error: insertError } = await supabase
          .from('parcelles')
          .insert({
            exploitation_id: activeExploitation.id,
            ...formData,
          })

        if (insertError) throw insertError
        setSuccess('Parcelle ajoutee')
      }

      setShowForm(false)
      setEditingParcelle(null)
      resetForm()
      loadParcelles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    }
  }

  const handleEdit = (parcelle: Parcelle) => {
    setEditingParcelle(parcelle)
    setFormData({
      nom: parcelle.nom,
      surface: parcelle.surface,
      culture_actuelle: parcelle.culture_actuelle || '',
      type_sol: parcelle.type_sol || '',
      irrigation: parcelle.irrigation,
      mode_production: parcelle.mode_production,
      date_debut_conversion: parcelle.date_debut_conversion || '',
      coordonnees_gps: parcelle.coordonnees_gps || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (parcelle: Parcelle) => {
    if (!confirm(`Supprimer la parcelle "${parcelle.nom}" ?`)) return

    try {
      const { error: deleteError } = await supabase
        .from('parcelles')
        .delete()
        .eq('id', parcelle.id)

      if (deleteError) throw deleteError
      setSuccess('Parcelle supprimee')
      loadParcelles()
    } catch (err) {
      setError('Erreur lors de la suppression')
    }
  }

  const resetForm = () => {
    setFormData({
      nom: '',
      surface: 0,
      culture_actuelle: '',
      type_sol: '',
      irrigation: false,
      mode_production: 'bio',
      date_debut_conversion: '',
      coordonnees_gps: '',
    })
  }

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'bio': return 'bg-green-100 text-green-800'
      case 'conversion': return 'bg-amber-100 text-amber-800'
      case 'conventionnel': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const totalSurface = parcelles.reduce((acc, p) => acc + p.surface, 0)

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Selectionnez une exploitation pour voir les parcelles.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parcelles</h1>
          <p className="text-gray-600">Gerez les parcelles de votre exploitation ({totalSurface.toFixed(2)} ha)</p>
        </div>
        <button
          onClick={() => {
            setEditingParcelle(null)
            resetForm()
            setShowForm(true)
          }}
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Ajouter une parcelle
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">{success}</div>
      )}

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingParcelle ? 'Modifier la parcelle' : 'Nouvelle parcelle'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Surface (ha) *</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={formData.surface || ''}
                  onChange={(e) => setFormData({ ...formData, surface: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Culture actuelle</label>
                <input
                  type="text"
                  value={formData.culture_actuelle}
                  onChange={(e) => setFormData({ ...formData, culture_actuelle: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Ex: Ble tendre"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de sol</label>
                <select
                  value={formData.type_sol}
                  onChange={(e) => setFormData({ ...formData, type_sol: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Selectionner...</option>
                  <option value="argileux">Argileux</option>
                  <option value="limoneux">Limoneux</option>
                  <option value="sableux">Sableux</option>
                  <option value="argilo-limoneux">Argilo-limoneux</option>
                  <option value="limono-sableux">Limono-sableux</option>
                  <option value="calcaire">Calcaire</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mode de production *</label>
                <select
                  value={formData.mode_production}
                  onChange={(e) => setFormData({ ...formData, mode_production: e.target.value as 'bio' | 'conversion' | 'conventionnel' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="bio">Bio</option>
                  <option value="conversion">En conversion</option>
                  <option value="conventionnel">Conventionnel</option>
                </select>
              </div>
              {formData.mode_production === 'conversion' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date debut conversion</label>
                  <input
                    type="date"
                    value={formData.date_debut_conversion}
                    onChange={(e) => setFormData({ ...formData, date_debut_conversion: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              )}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="irrigation"
                  checked={formData.irrigation}
                  onChange={(e) => setFormData({ ...formData, irrigation: e.target.checked })}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <label htmlFor="irrigation" className="ml-2 text-sm text-gray-700">
                  Parcelle irriguee
                </label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingParcelle(null)
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
                {editingParcelle ? 'Modifier' : 'Ajouter'}
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
      ) : parcelles.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Aucune parcelle</h3>
          <p className="text-gray-500">Commencez par ajouter votre premiere parcelle</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parcelles.map((parcelle) => (
            <div key={parcelle.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{parcelle.nom}</h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getModeColor(parcelle.mode_production)}`}>
                  {parcelle.mode_production === 'bio' ? 'Bio' : parcelle.mode_production === 'conversion' ? 'Conversion' : 'Conv.'}
                </span>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Surface</dt>
                  <dd className="font-medium text-gray-900">{parcelle.surface} ha</dd>
                </div>
                {parcelle.culture_actuelle && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Culture</dt>
                    <dd className="text-gray-900">{parcelle.culture_actuelle}</dd>
                  </div>
                )}
                {parcelle.type_sol && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Sol</dt>
                    <dd className="text-gray-900 capitalize">{parcelle.type_sol}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500">Irrigation</dt>
                  <dd className="text-gray-900">{parcelle.irrigation ? 'Oui' : 'Non'}</dd>
                </div>
              </dl>
              <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-gray-100">
                <button
                  onClick={() => handleEdit(parcelle)}
                  className="p-2 text-gray-400 hover:text-green-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(parcelle)}
                  className="p-2 text-gray-400 hover:text-red-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
