'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'
import type { Exploitation, ExploitationFormData } from '@/types/database'

type TabType = 'general' | 'exploitations' | 'abonnement' | 'notifications'

function SettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { activeExploitation, updateExploitation, exploitations, createExploitation, refreshExploitations } = useExploitation()
  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const supabase = createClient()

  // États pour les formulaires
  const [exploitationForm, setExploitationForm] = useState<ExploitationFormData>({
    name: '',
    siret: '',
    adresse: '',
    code_postal: '',
    ville: '',
    telephone: '',
    email: '',
    num_agrement_bio: '',
    organisme_certificateur: '',
    date_certification: '',
    surface_totale: undefined,
  })

  const [newExploitationForm, setNewExploitationForm] = useState<ExploitationFormData>({
    name: '',
    siret: '',
    adresse: '',
    code_postal: '',
    ville: '',
    telephone: '',
    email: '',
    num_agrement_bio: '',
    organisme_certificateur: '',
    date_certification: '',
    surface_totale: undefined,
  })

  const [showNewExploitationForm, setShowNewExploitationForm] = useState(false)

  // Récupérer l'onglet depuis l'URL
  useEffect(() => {
    const tab = searchParams.get('tab') as TabType
    if (tab && ['general', 'exploitations', 'abonnement', 'notifications'].includes(tab)) {
      setActiveTab(tab)
    }

    // Gérer les messages de succès/erreur de Stripe
    const success = searchParams.get('success')
    const canceled = searchParams.get('canceled')

    if (success === 'true') {
      setMessage({ type: 'success', text: 'Abonnement activé avec succès !' })
      refreshExploitations()
    } else if (canceled === 'true') {
      setMessage({ type: 'error', text: 'Paiement annulé.' })
    }
  }, [searchParams, refreshExploitations])

  // Charger les données de l'exploitation active
  useEffect(() => {
    if (activeExploitation) {
      setExploitationForm({
        name: activeExploitation.name || '',
        siret: activeExploitation.siret || '',
        adresse: activeExploitation.adresse || '',
        code_postal: activeExploitation.code_postal || '',
        ville: activeExploitation.ville || '',
        telephone: activeExploitation.telephone || '',
        email: activeExploitation.email || '',
        num_agrement_bio: activeExploitation.num_agrement_bio || '',
        organisme_certificateur: activeExploitation.organisme_certificateur || '',
        date_certification: activeExploitation.date_certification || '',
        surface_totale: activeExploitation.surface_totale || undefined,
      })
    }
  }, [activeExploitation])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    router.push(`/dashboard/settings?tab=${tab}`, { scroll: false })
  }

  // Sauvegarder les modifications de l'exploitation
  const handleSaveExploitation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeExploitation) return

    setLoading(true)
    setMessage(null)

    try {
      const success = await updateExploitation(activeExploitation.id, {
        ...exploitationForm,
        surface_totale: exploitationForm.surface_totale || null,
        date_certification: exploitationForm.date_certification || null,
      } as Partial<Exploitation>)

      if (success) {
        setMessage({ type: 'success', text: 'Modifications enregistrées' })
      } else {
        setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde' })
    } finally {
      setLoading(false)
    }
  }

  // Créer une nouvelle exploitation
  const handleCreateExploitation = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const newExploitation = await createExploitation({
        ...newExploitationForm,
        surface_totale: newExploitationForm.surface_totale || null,
        date_certification: newExploitationForm.date_certification || null,
      } as Partial<Exploitation>)

      if (newExploitation) {
        setMessage({ type: 'success', text: 'Exploitation créée avec succès' })
        setShowNewExploitationForm(false)
        setNewExploitationForm({
          name: '',
          siret: '',
          adresse: '',
          code_postal: '',
          ville: '',
          telephone: '',
          email: '',
          num_agrement_bio: '',
          organisme_certificateur: '',
          date_certification: '',
          surface_totale: undefined,
        })
      } else {
        setMessage({ type: 'error', text: 'Erreur lors de la création' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur lors de la création' })
    } finally {
      setLoading(false)
    }
  }

  // Gérer le checkout Stripe
  const handleCheckout = async () => {
    if (!activeExploitation) return

    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exploitationId: activeExploitation.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la création du paiement')
      }

      // Rediriger vers Stripe Checkout
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('URL de paiement non reçue')
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erreur lors du paiement'
      })
      setLoading(false)
    }
  }

  // Gérer le portail client Stripe
  const handleManageSubscription = async () => {
    if (!activeExploitation) return

    setLoading(true)

    try {
      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exploitationId: activeExploitation.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur')
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erreur'
      })
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'general' as const, label: 'General', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { id: 'exploitations' as const, label: 'Exploitations', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { id: 'abonnement' as const, label: 'Abonnement', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { id: 'notifications' as const, label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parametres</h1>
        <p className="text-gray-600">Gerez votre compte et vos exploitations</p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* Onglets */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Contenu */}
        <div className="p-6">
          {/* Onglet Général */}
          {activeTab === 'general' && activeExploitation && (
            <form onSubmit={handleSaveExploitation} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom de l&apos;exploitation *
                  </label>
                  <input
                    type="text"
                    required
                    value={exploitationForm.name}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SIRET
                  </label>
                  <input
                    type="text"
                    value={exploitationForm.siret}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, siret: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    maxLength={14}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse
                  </label>
                  <input
                    type="text"
                    value={exploitationForm.adresse}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, adresse: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code postal
                  </label>
                  <input
                    type="text"
                    value={exploitationForm.code_postal}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, code_postal: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    maxLength={5}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ville
                  </label>
                  <input
                    type="text"
                    value={exploitationForm.ville}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, ville: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Telephone
                  </label>
                  <input
                    type="tel"
                    value={exploitationForm.telephone}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, telephone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={exploitationForm.email}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              <hr className="my-6" />

              <h3 className="text-lg font-medium text-gray-900 mb-4">Certification Bio</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Numero Bio
                  </label>
                  <input
                    type="text"
                    value={exploitationForm.num_agrement_bio}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, num_agrement_bio: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="FR-BIO-XX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organisme certificateur
                  </label>
                  <select
                    value={exploitationForm.organisme_certificateur}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, organisme_certificateur: e.target.value })}
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
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date de certification
                  </label>
                  <input
                    type="date"
                    value={exploitationForm.date_certification}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, date_certification: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Surface totale (ha)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={exploitationForm.surface_totale || ''}
                    onChange={(e) => setExploitationForm({ ...exploitationForm, surface_totale: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          )}

          {/* Onglet Exploitations */}
          {activeTab === 'exploitations' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Mes exploitations</h3>
                <button
                  onClick={() => setShowNewExploitationForm(!showNewExploitationForm)}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Nouvelle exploitation
                </button>
              </div>

              {/* Formulaire nouvelle exploitation */}
              {showNewExploitationForm && (
                <form onSubmit={handleCreateExploitation} className="bg-gray-50 rounded-lg p-6 space-y-4">
                  <h4 className="font-medium text-gray-900">Nouvelle exploitation</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                      <input
                        type="text"
                        required
                        value={newExploitationForm.name}
                        onChange={(e) => setNewExploitationForm({ ...newExploitationForm, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SIRET</label>
                      <input
                        type="text"
                        value={newExploitationForm.siret}
                        onChange={(e) => setNewExploitationForm({ ...newExploitationForm, siret: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        maxLength={14}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                      <input
                        type="text"
                        value={newExploitationForm.ville}
                        onChange={(e) => setNewExploitationForm({ ...newExploitationForm, ville: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Surface (ha)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newExploitationForm.surface_totale || ''}
                        onChange={(e) => setNewExploitationForm({ ...newExploitationForm, surface_totale: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowNewExploitationForm(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {loading ? 'Creation...' : 'Creer'}
                    </button>
                  </div>
                </form>
              )}

              {/* Liste des exploitations */}
              <div className="space-y-3">
                {exploitations.map((exploitation) => (
                  <div
                    key={exploitation.id}
                    className={`p-4 rounded-lg border-2 transition-colors ${
                      activeExploitation?.id === exploitation.id
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{exploitation.name}</h4>
                        <p className="text-sm text-gray-500">
                          {exploitation.siret || 'SIRET non renseigne'}
                          {exploitation.ville && ` - ${exploitation.ville}`}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {exploitation.subscription_status === 'active' && (
                          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                            Pro
                          </span>
                        )}
                        {activeExploitation?.id === exploitation.id && (
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {exploitations.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    Aucune exploitation. Creez votre premiere exploitation pour commencer.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Onglet Abonnement */}
          {activeTab === 'abonnement' && (
            <div className="space-y-6">
              {/* Plan actuel */}
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {activeExploitation?.subscription_status === 'active' ? 'Plan Pro' : 'Plan Gratuit'}
                    </h3>
                    <p className="text-gray-600 mt-1">
                      {activeExploitation?.subscription_status === 'active'
                        ? 'Accès illimité à toutes les fonctionnalités'
                        : 'Fonctionnalités limitées'}
                    </p>
                  </div>
                  <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                    activeExploitation?.subscription_status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-200 text-gray-800'
                  }`}>
                    {activeExploitation?.subscription_status === 'active' ? 'Actif' : 'Gratuit'}
                  </div>
                </div>
              </div>

              {/* Comparaison des plans */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Plan Gratuit */}
                <div className="border border-gray-200 rounded-xl p-6">
                  <h4 className="text-lg font-semibold text-gray-900">Gratuit</h4>
                  <p className="text-3xl font-bold text-gray-900 mt-2">0 EUR<span className="text-sm font-normal text-gray-500">/mois</span></p>
                  <ul className="mt-6 space-y-3">
                    {[
                      '1 exploitation',
                      '5 parcelles max',
                      '50 intrants/mois',
                      'OCR basique',
                      'Support email',
                    ].map((feature, i) => (
                      <li key={i} className="flex items-center text-gray-600">
                        <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Plan Pro */}
                <div className="border-2 border-green-500 rounded-xl p-6 relative">
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-3 py-1 bg-green-500 text-white text-sm font-medium rounded-full">
                    Recommande
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">Pro</h4>
                  <p className="text-3xl font-bold text-gray-900 mt-2">29 EUR<span className="text-sm font-normal text-gray-500">/mois</span></p>
                  <ul className="mt-6 space-y-3">
                    {[
                      'Exploitations illimitées',
                      'Parcelles illimitées',
                      'Intrants illimités',
                      'OCR avancé multi-lignes',
                      'Bilan matière automatique',
                      'Export registre officiel',
                      'Support prioritaire',
                      'API access',
                    ].map((feature, i) => (
                      <li key={i} className="flex items-center text-gray-600">
                        <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {activeExploitation?.subscription_status === 'active' ? (
                    <button
                      onClick={handleManageSubscription}
                      disabled={loading}
                      className="w-full mt-6 px-4 py-3 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
                    >
                      {loading ? 'Chargement...' : 'Gerer mon abonnement'}
                    </button>
                  ) : (
                    <button
                      onClick={handleCheckout}
                      disabled={loading || !activeExploitation}
                      className="w-full mt-6 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {loading ? 'Redirection...' : 'Passer a Pro'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Onglet Notifications */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <p className="text-gray-600">Configurez vos preferences de notifications.</p>

              <div className="space-y-4">
                {[
                  { id: 'email_certificats', label: 'Alertes expiration certificats', description: 'Recevez un email 30 jours avant expiration' },
                  { id: 'email_rappels', label: 'Rappels saisie', description: 'Rappels hebdomadaires pour la saisie des intrants' },
                  { id: 'email_bilan', label: 'Bilan mensuel', description: 'Recevez un résumé mensuel de votre activité' },
                ].map((notification) => (
                  <div key={notification.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{notification.label}</p>
                      <p className="text-sm text-gray-500">{notification.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}
