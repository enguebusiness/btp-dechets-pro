'use client'

import { useEffect, useState, useCallback } from 'react'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'
import type { CertificatFournisseur } from '@/types/database'

export default function CertificatsPage() {
  const { activeExploitation } = useExploitation()
  const [certificats, setCertificats] = useState<CertificatFournisseur[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCertificat, setEditingCertificat] = useState<CertificatFournisseur | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'valide' | 'expire' | 'a_renouveler'>('all')
  const supabase = createClient()

  const [formData, setFormData] = useState({
    fournisseur_nom: '',
    numero_certificat: '',
    organisme_certificateur: '',
    date_emission: '',
    date_expiration: '',
    produits_couverts: '',
    document_url: '',
  })

  const loadCertificats = useCallback(async () => {
    if (!activeExploitation) return

    try {
      setLoading(true)
      let query = supabase
        .from('certificats_fournisseurs')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .order('date_expiration', { ascending: true })

      if (filter !== 'all') {
        query = query.eq('statut', filter)
      }

      const { data, error: fetchError } = await query

      if (fetchError && fetchError.code !== '42P01') throw fetchError
      setCertificats(data || [])
    } catch (err) {
      console.error('Erreur:', err)
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [activeExploitation, supabase, filter])

  useEffect(() => {
    loadCertificats()
  }, [loadCertificats])

  const calculateStatut = (dateExpiration: string): 'valide' | 'expire' | 'a_renouveler' => {
    const today = new Date()
    const expiration = new Date(dateExpiration)
    const daysUntilExpiration = Math.ceil((expiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiration < 0) return 'expire'
    if (daysUntilExpiration <= 30) return 'a_renouveler'
    return 'valide'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeExploitation) return

    setError(null)
    setSuccess(null)

    try {
      const statut = calculateStatut(formData.date_expiration)
      const produits = formData.produits_couverts.split(',').map(p => p.trim()).filter(Boolean)

      const dataToSave = {
        fournisseur_nom: formData.fournisseur_nom,
        numero_certificat: formData.numero_certificat,
        organisme_certificateur: formData.organisme_certificateur,
        date_emission: formData.date_emission,
        date_expiration: formData.date_expiration,
        produits_couverts: produits,
        document_url: formData.document_url || null,
        statut,
      }

      if (editingCertificat) {
        const { error: updateError } = await supabase
          .from('certificats_fournisseurs')
          .update({
            ...dataToSave,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCertificat.id)

        if (updateError) throw updateError
        setSuccess('Certificat modifie')
      } else {
        const { error: insertError } = await supabase
          .from('certificats_fournisseurs')
          .insert({
            exploitation_id: activeExploitation.id,
            ...dataToSave,
          })

        if (insertError) throw insertError
        setSuccess('Certificat ajoute')
      }

      setShowForm(false)
      setEditingCertificat(null)
      resetForm()
      loadCertificats()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    }
  }

  const handleEdit = (certificat: CertificatFournisseur) => {
    setEditingCertificat(certificat)
    setFormData({
      fournisseur_nom: certificat.fournisseur_nom,
      numero_certificat: certificat.numero_certificat || '',
      organisme_certificateur: certificat.organisme_certificateur || '',
      date_emission: certificat.date_emission || '',
      date_expiration: certificat.date_expiration,
      produits_couverts: certificat.produits_couverts.join(', '),
      document_url: certificat.storage_path || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (certificat: CertificatFournisseur) => {
    if (!confirm(`Supprimer le certificat de ${certificat.fournisseur_nom} ?`)) return

    try {
      const { error: deleteError } = await supabase
        .from('certificats_fournisseurs')
        .delete()
        .eq('id', certificat.id)

      if (deleteError) throw deleteError
      setSuccess('Certificat supprime')
      loadCertificats()
    } catch (err) {
      setError('Erreur lors de la suppression')
    }
  }

  const resetForm = () => {
    setFormData({
      fournisseur_nom: '',
      numero_certificat: '',
      organisme_certificateur: '',
      date_emission: '',
      date_expiration: '',
      produits_couverts: '',
      document_url: '',
    })
  }

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'valide': return 'bg-green-100 text-green-800'
      case 'a_renouveler': return 'bg-amber-100 text-amber-800'
      case 'expire': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatutLabel = (statut: string) => {
    switch (statut) {
      case 'valide': return 'Valide'
      case 'a_renouveler': return 'A renouveler'
      case 'expire': return 'Expire'
      default: return statut
    }
  }

  const expiredCount = certificats.filter(c => c.statut === 'expire').length
  const expiringCount = certificats.filter(c => c.statut === 'a_renouveler').length

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Selectionnez une exploitation pour voir les certificats.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Certificats Fournisseurs</h1>
          <p className="text-gray-600">Suivez la validite des certificats bio de vos fournisseurs</p>
        </div>
        <button
          onClick={() => {
            setEditingCertificat(null)
            resetForm()
            setShowForm(true)
          }}
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Ajouter un certificat
        </button>
      </div>

      {/* Alertes */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <div className={`rounded-lg p-4 ${expiredCount > 0 ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div className="flex items-start">
            <svg className={`w-5 h-5 mt-0.5 mr-3 ${expiredCount > 0 ? 'text-red-500' : 'text-amber-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              {expiredCount > 0 && (
                <p className="text-red-800">
                  {expiredCount} certificat(s) expire(s) - Action requise
                </p>
              )}
              {expiringCount > 0 && (
                <p className="text-amber-800">
                  {expiringCount} certificat(s) a renouveler dans les 30 jours
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">{success}</div>}

      {/* Filtres */}
      <div className="flex gap-2 overflow-x-auto">
        {(['all', 'valide', 'a_renouveler', 'expire'] as const).map((statut) => (
          <button
            key={statut}
            onClick={() => setFilter(statut)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === statut
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {statut === 'all' ? 'Tous' : getStatutLabel(statut)}
          </button>
        ))}
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingCertificat ? 'Modifier le certificat' : 'Nouveau certificat'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur *</label>
                <input
                  type="text"
                  required
                  value={formData.fournisseur_nom}
                  onChange={(e) => setFormData({ ...formData, fournisseur_nom: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° Certificat *</label>
                <input
                  type="text"
                  required
                  value={formData.numero_certificat}
                  onChange={(e) => setFormData({ ...formData, numero_certificat: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organisme certificateur *</label>
                <select
                  required
                  value={formData.organisme_certificateur}
                  onChange={(e) => setFormData({ ...formData, organisme_certificateur: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Selectionner...</option>
                  <option value="Ecocert">Ecocert</option>
                  <option value="Bureau Veritas">Bureau Veritas</option>
                  <option value="Certipaq Bio">Certipaq Bio</option>
                  <option value="Certisud">Certisud</option>
                  <option value="Alpes Controles">Alpes Controles</option>
                  <option value="Certis">Certis</option>
                  <option value="Qualisud">Qualisud</option>
                  <option value="Ocacia">Ocacia</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;emission *</label>
                <input
                  type="date"
                  required
                  value={formData.date_emission}
                  onChange={(e) => setFormData({ ...formData, date_emission: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;expiration *</label>
                <input
                  type="date"
                  required
                  value={formData.date_expiration}
                  onChange={(e) => setFormData({ ...formData, date_expiration: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Produits couverts (separes par des virgules)</label>
                <input
                  type="text"
                  value={formData.produits_couverts}
                  onChange={(e) => setFormData({ ...formData, produits_couverts: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Ex: Semences ble, Engrais NPK, Compost"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingCertificat(null)
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
                {editingCertificat ? 'Modifier' : 'Ajouter'}
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
      ) : certificats.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Aucun certificat</h3>
          <p className="text-gray-500">Ajoutez les certificats bio de vos fournisseurs</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {certificats.map((cert) => (
            <div key={cert.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{cert.fournisseur_nom}</h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatutColor(cert.statut)}`}>
                  {getStatutLabel(cert.statut)}
                </span>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">N° Certificat</dt>
                  <dd className="text-gray-900">{cert.numero_certificat}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Organisme</dt>
                  <dd className="text-gray-900">{cert.organisme_certificateur}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Expiration</dt>
                  <dd className={cert.statut === 'expire' ? 'text-red-600 font-medium' : 'text-gray-900'}>
                    {new Date(cert.date_expiration).toLocaleDateString('fr-FR')}
                  </dd>
                </div>
                {cert.produits_couverts.length > 0 && (
                  <div>
                    <dt className="text-gray-500 mb-1">Produits</dt>
                    <dd className="flex flex-wrap gap-1">
                      {cert.produits_couverts.slice(0, 3).map((p, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                          {p}
                        </span>
                      ))}
                      {cert.produits_couverts.length > 3 && (
                        <span className="text-xs text-gray-500">+{cert.produits_couverts.length - 3}</span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-gray-100">
                <button onClick={() => handleEdit(cert)} className="p-2 text-gray-400 hover:text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button onClick={() => handleDelete(cert)} className="p-2 text-gray-400 hover:text-red-600">
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
