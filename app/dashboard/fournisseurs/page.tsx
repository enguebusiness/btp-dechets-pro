'use client'

import { useState, useEffect } from 'react'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'
import type { Supplier, SupplierFormData, AgenceBioSearchResult } from '@/types/database'

export default function FournisseursPage() {
  const { activeExploitation } = useExploitation()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [verifying, setVerifying] = useState<string | null>(null)
  const [agenceBioResults, setAgenceBioResults] = useState<AgenceBioSearchResult[]>([])
  const [showAgenceBioSearch, setShowAgenceBioSearch] = useState(false)
  const supabase = createClient()

  const [formData, setFormData] = useState<SupplierFormData>({
    nom: '',
    siren: '',
    siret: '',
    adresse: '',
    code_postal: '',
    ville: '',
    statut_bio: 'inconnu',
    numero_bio: '',
    organisme_certificateur: '',
    notes: '',
  })

  useEffect(() => {
    if (activeExploitation) {
      loadSuppliers()
    }
  }, [activeExploitation])

  const loadSuppliers = async () => {
    if (!activeExploitation) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .order('nom')

      if (error) throw error
      setSuppliers(data || [])
    } catch (error) {
      console.error('Erreur chargement fournisseurs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchAgenceBio = async () => {
    if (!searchQuery.trim()) return

    setVerifying('search')
    try {
      const response = await fetch('/api/agence-bio/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: searchQuery,
          type: 'supplier',
          exploitationId: activeExploitation?.id,
        }),
      })

      const data = await response.json()
      if (data.success && data.results) {
        setAgenceBioResults(data.results)
        setShowAgenceBioSearch(true)
      }
    } catch (error) {
      console.error('Erreur recherche Agence Bio:', error)
    } finally {
      setVerifying(null)
    }
  }

  const selectFromAgenceBio = (result: AgenceBioSearchResult) => {
    setFormData({
      nom: result.nom,
      siren: result.siren || '',
      siret: result.siret || '',
      adresse: result.adresse || '',
      code_postal: result.code_postal || '',
      ville: result.ville || '',
      statut_bio: result.statut,
      numero_bio: result.numero_bio || '',
      organisme_certificateur: result.organisme_certificateur || '',
      notes: `Importé depuis Agence Bio - ID: ${result.id}`,
    })
    setShowAgenceBioSearch(false)
    setShowAddForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeExploitation) return

    try {
      const { error } = await supabase.from('suppliers').insert({
        exploitation_id: activeExploitation.id,
        ...formData,
      })

      if (error) throw error

      setShowAddForm(false)
      setFormData({
        nom: '',
        siren: '',
        siret: '',
        adresse: '',
        code_postal: '',
        ville: '',
        statut_bio: 'inconnu',
        numero_bio: '',
        organisme_certificateur: '',
        notes: '',
      })
      loadSuppliers()
    } catch (error) {
      console.error('Erreur ajout fournisseur:', error)
    }
  }

  const verifySupplier = async (supplier: Supplier) => {
    setVerifying(supplier.id)
    try {
      const searchParam = supplier.siren
        ? { siret: supplier.siren }
        : { nom: supplier.nom }

      const response = await fetch('/api/agence-bio/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...searchParam,
          type: 'supplier',
          exploitationId: activeExploitation?.id,
        }),
      })

      const data = await response.json()

      if (data.found && data.results.length > 0) {
        const result = data.results[0]
        await supabase
          .from('suppliers')
          .update({
            agence_bio_verified: true,
            agence_bio_id: result.id,
            statut_bio: result.statut,
            numero_bio: result.numero_bio,
            organisme_certificateur: result.organisme_certificateur,
            date_derniere_verif: new Date().toISOString(),
            url_certificat: result.url_fiche,
          })
          .eq('id', supplier.id)

        loadSuppliers()
      } else {
        await supabase
          .from('suppliers')
          .update({
            agence_bio_verified: false,
            date_derniere_verif: new Date().toISOString(),
          })
          .eq('id', supplier.id)

        loadSuppliers()
      }
    } catch (error) {
      console.error('Erreur vérification:', error)
    } finally {
      setVerifying(null)
    }
  }

  const getStatusBadge = (statut: string, verified: boolean) => {
    if (statut === 'certifie' && verified) {
      return { label: 'Certifie Bio', color: 'bg-green-100 text-green-800', emoji: '🟢' }
    } else if (statut === 'en_conversion') {
      return { label: 'En conversion', color: 'bg-yellow-100 text-yellow-800', emoji: '🟠' }
    } else if (statut === 'non_certifie') {
      return { label: 'Non certifie', color: 'bg-red-100 text-red-800', emoji: '🔴' }
    } else {
      return { label: 'Non verifie', color: 'bg-gray-100 text-gray-800', emoji: '⚪' }
    }
  }

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Selectionnez une exploitation pour gerer les fournisseurs.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fournisseurs</h1>
          <p className="text-gray-600">Gerez vos fournisseurs et leur certification Bio</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter un fournisseur
        </button>
      </div>

      {/* Recherche Agence Bio */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Rechercher sur l&apos;Annuaire Agence Bio</h2>
        <div className="flex gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nom du fournisseur ou SIRET..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            onClick={handleSearchAgenceBio}
            disabled={verifying === 'search' || !searchQuery.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {verifying === 'search' ? (
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Recherche...
              </span>
            ) : (
              'Rechercher'
            )}
          </button>
        </div>

        {/* Résultats Agence Bio */}
        {showAgenceBioSearch && agenceBioResults.length > 0 && (
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <p className="text-sm text-gray-600">{agenceBioResults.length} resultat(s) trouve(s)</p>
            </div>
            <div className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
              {agenceBioResults.map((result) => (
                <div key={result.id} className="p-4 hover:bg-gray-50 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{result.nom}</p>
                    <p className="text-sm text-gray-500">
                      {result.siret && `SIRET: ${result.siret} - `}
                      {result.ville}
                      {result.numero_bio && ` - Bio: ${result.numero_bio}`}
                    </p>
                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
                      result.statut === 'certifie' ? 'bg-green-100 text-green-800' :
                      result.statut === 'en_conversion' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {result.statut === 'certifie' ? 'Certifie Bio' :
                       result.statut === 'en_conversion' ? 'En conversion' : 'Non certifie'}
                    </span>
                  </div>
                  <button
                    onClick={() => selectFromAgenceBio(result)}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                  >
                    Selectionner
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Formulaire ajout */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Nouveau fournisseur</h2>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SIREN</label>
                <input
                  type="text"
                  value={formData.siren}
                  onChange={(e) => setFormData({ ...formData, siren: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="123456789"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SIRET</label>
                <input
                  type="text"
                  value={formData.siret}
                  onChange={(e) => setFormData({ ...formData, siret: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="12345678901234"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statut Bio</label>
                <select
                  value={formData.statut_bio}
                  onChange={(e) => setFormData({ ...formData, statut_bio: e.target.value as SupplierFormData['statut_bio'] })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="inconnu">Inconnu</option>
                  <option value="certifie">Certifie Bio</option>
                  <option value="en_conversion">En conversion</option>
                  <option value="non_certifie">Non certifie</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero Bio</label>
                <input
                  type="text"
                  value={formData.numero_bio}
                  onChange={(e) => setFormData({ ...formData, numero_bio: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="FR-BIO-XX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organisme certificateur</label>
                <input
                  type="text"
                  value={formData.organisme_certificateur}
                  onChange={(e) => setFormData({ ...formData, organisme_certificateur: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Ecocert, Bureau Veritas..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                <input
                  type="text"
                  value={formData.ville}
                  onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code postal</label>
                <input
                  type="text"
                  value={formData.code_postal}
                  onChange={(e) => setFormData({ ...formData, code_postal: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Ajouter
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des fournisseurs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Mes fournisseurs ({suppliers.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p>Aucun fournisseur enregistre</p>
            <p className="text-sm mt-1">Recherchez sur l&apos;Agence Bio ou ajoutez manuellement</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {suppliers.map((supplier) => {
              const badge = getStatusBadge(supplier.statut_bio, supplier.agence_bio_verified)
              return (
                <div key={supplier.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-gray-900">{supplier.nom}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${badge.color}`}>
                          {badge.emoji} {badge.label}
                        </span>
                        {supplier.agence_bio_verified && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                            Verifie
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-500 space-x-4">
                        {supplier.siren && <span>SIREN: {supplier.siren}</span>}
                        {supplier.numero_bio && <span>Bio: {supplier.numero_bio}</span>}
                        {supplier.ville && <span>{supplier.ville}</span>}
                      </div>
                      {supplier.organisme_certificateur && (
                        <p className="mt-1 text-sm text-gray-500">
                          Certifie par: {supplier.organisme_certificateur}
                        </p>
                      )}
                      {supplier.date_derniere_verif && (
                        <p className="mt-1 text-xs text-gray-400">
                          Derniere verification: {new Date(supplier.date_derniere_verif).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {supplier.url_certificat && (
                        <a
                          href={supplier.url_certificat}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Voir sur Agence Bio"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      <button
                        onClick={() => verifySupplier(supplier)}
                        disabled={verifying === supplier.id}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                      >
                        {verifying === supplier.id ? (
                          <span className="flex items-center">
                            <svg className="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Verification...
                          </span>
                        ) : (
                          'Reverifier'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
