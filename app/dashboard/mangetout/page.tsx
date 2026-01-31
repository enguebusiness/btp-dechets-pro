'use client'

import { useState, useCallback } from 'react'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'
import type { OcrData, LigneFacture, IntrantFormData } from '@/types/database'

type Step = 'upload' | 'review' | 'validate' | 'complete'

export default function MangeToutPage() {
  const { activeExploitation } = useExploitation()
  const [step, setStep] = useState<Step>('upload')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [ocrData, setOcrData] = useState<OcrData | null>(null)
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set())
  const [editingLine, setEditingLine] = useState<string | null>(null)
  const [editedLines, setEditedLines] = useState<Record<string, Partial<LigneFacture>>>({})
  const [savedCount, setSavedCount] = useState(0)
  const supabase = createClient()

  // Drag and drop
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [])

  const handleFileSelect = (selectedFile: File) => {
    setError(null)

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Type de fichier non supporté. Utilisez JPG, PNG, WebP ou PDF.')
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Fichier trop volumineux (max 10MB)')
      return
    }

    setFile(selectedFile)

    // Créer une preview pour les images
    if (selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }
  }

  const handleAnalyze = async () => {
    if (!file || !activeExploitation) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('exploitationId', activeExploitation.id)

      const response = await fetch('/api/ocr/analyze', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'analyse')
      }

      setOcrData(data.data)

      // Sélectionner toutes les lignes par défaut
      if (data.data?.lignes) {
        setSelectedLines(new Set(data.data.lignes.map((l: LigneFacture) => l.id)))
      }

      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'analyse')
    } finally {
      setLoading(false)
    }
  }

  const toggleLineSelection = (lineId: string) => {
    const newSelected = new Set(selectedLines)
    if (newSelected.has(lineId)) {
      newSelected.delete(lineId)
    } else {
      newSelected.add(lineId)
    }
    setSelectedLines(newSelected)
  }

  const selectAllLines = () => {
    if (ocrData?.lignes) {
      setSelectedLines(new Set(ocrData.lignes.map(l => l.id)))
    }
  }

  const deselectAllLines = () => {
    setSelectedLines(new Set())
  }

  const handleEditLine = (lineId: string, field: keyof LigneFacture, value: unknown) => {
    setEditedLines(prev => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        [field]: value,
      },
    }))
  }

  const getLineData = (line: LigneFacture): LigneFacture => {
    return {
      ...line,
      ...editedLines[line.id],
    }
  }

  const handleValidateAndSave = async () => {
    if (!ocrData || !activeExploitation || selectedLines.size === 0) return

    setLoading(true)
    setError(null)
    setStep('validate')

    try {
      // Créer les intrants pour chaque ligne sélectionnée
      const linesToSave = ocrData.lignes.filter(l => selectedLines.has(l.id))
      let savedSuccessfully = 0

      for (const ligne of linesToSave) {
        const lineData = getLineData(ligne)

        const intrantData: IntrantFormData = {
          produit_nom: lineData.description,
          fournisseur: ocrData.fournisseur || undefined,
          lot_number: lineData.numero_lot || undefined,
          quantite: lineData.quantite || 0,
          unite: lineData.unite || 'unite',
          date_achat: ocrData.date_facture || new Date().toISOString().split('T')[0],
          prix_unitaire: lineData.prix_unitaire || undefined,
          prix_total: lineData.prix_total || undefined,
          est_bio: lineData.is_bio || false,
          type_intrant: 'autre', // À déterminer selon la description
          notes: `Importé depuis facture ${ocrData.numero_facture || 'N/A'} - Ref: ${lineData.reference || 'N/A'}`,
        }

        const { error: insertError } = await supabase
          .from('intrants')
          .insert({
            exploitation_id: activeExploitation.id,
            ...intrantData,
          })

        if (!insertError) {
          savedSuccessfully++
        } else {
          console.error('Erreur insertion intrant:', insertError)
        }
      }

      setSavedCount(savedSuccessfully)
      setStep('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
      setStep('review')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setStep('upload')
    setFile(null)
    setPreviewUrl(null)
    setOcrData(null)
    setSelectedLines(new Set())
    setEditingLine(null)
    setEditedLines({})
    setSavedCount(0)
    setError(null)
  }

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Sélectionnez une exploitation pour utiliser MangeTout.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">MangeTout - OCR Intelligent</h1>
        <p className="text-gray-600">Scannez vos factures et importez automatiquement tous les produits</p>
      </div>

      {/* Indicateur d'étapes */}
      <div className="flex items-center justify-center space-x-4 py-4">
        {[
          { id: 'upload', label: 'Upload' },
          { id: 'review', label: 'Verification' },
          { id: 'validate', label: 'Validation' },
          { id: 'complete', label: 'Termine' },
        ].map((s, index) => (
          <div key={s.id} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s.id
                ? 'bg-green-600 text-white'
                : ['upload', 'review', 'validate', 'complete'].indexOf(step) > index
                  ? 'bg-green-100 text-green-600'
                  : 'bg-gray-200 text-gray-500'
            }`}>
              {index + 1}
            </div>
            {index < 3 && (
              <div className={`w-12 h-1 mx-2 ${
                ['upload', 'review', 'validate', 'complete'].indexOf(step) > index
                  ? 'bg-green-200'
                  : 'bg-gray-200'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          {error}
        </div>
      )}

      {/* Étape 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-green-500 bg-green-50'
                : file
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            {file ? (
              <div className="space-y-4">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-64 mx-auto rounded-lg shadow-sm"
                  />
                )}
                <div className="flex items-center justify-center space-x-2">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-gray-700 font-medium">{file.name}</span>
                </div>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <button
                  onClick={() => {
                    setFile(null)
                    setPreviewUrl(null)
                  }}
                  className="text-sm text-red-600 hover:underline"
                >
                  Supprimer
                </button>
              </div>
            ) : (
              <>
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-gray-600 mb-2">
                  Glissez-deposez votre facture ici ou
                </p>
                <label className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer transition-colors">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Parcourir
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    className="hidden"
                  />
                </label>
                <p className="text-sm text-gray-500 mt-4">
                  Formats acceptes: JPG, PNG, WebP, PDF (max 10MB)
                </p>
              </>
            )}
          </div>

          {file && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Analyser la facture
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Étape 2: Review */}
      {step === 'review' && ocrData && (
        <div className="space-y-6">
          {/* Informations générales de la facture */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Informations de la facture</h2>
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-500">Fournisseur</label>
                <p className="font-medium text-gray-900">{ocrData.fournisseur || '-'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-500">Numero</label>
                <p className="font-medium text-gray-900">{ocrData.numero_facture || '-'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-500">Date</label>
                <p className="font-medium text-gray-900">
                  {ocrData.date_facture
                    ? new Date(ocrData.date_facture).toLocaleDateString('fr-FR')
                    : '-'}
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-500">Total TTC</label>
                <p className="font-medium text-gray-900">
                  {ocrData.total_ttc ? `${ocrData.total_ttc.toFixed(2)} EUR` : '-'}
                </p>
              </div>
            </div>
            {ocrData.confidence_score !== null && (
              <div className="mt-4 flex items-center text-sm">
                <span className="text-gray-500 mr-2">Confiance:</span>
                <div className="flex-1 h-2 bg-gray-200 rounded-full max-w-xs">
                  <div
                    className={`h-2 rounded-full ${
                      ocrData.confidence_score > 0.8
                        ? 'bg-green-500'
                        : ocrData.confidence_score > 0.5
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${ocrData.confidence_score * 100}%` }}
                  />
                </div>
                <span className="ml-2 text-gray-700">
                  {Math.round(ocrData.confidence_score * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Liste des lignes */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Lignes detectees ({ocrData.lignes.length})
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={selectAllLines}
                  className="text-sm text-green-600 hover:underline"
                >
                  Tout selectionner
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={deselectAllLines}
                  className="text-sm text-gray-600 hover:underline"
                >
                  Tout deselectionner
                </button>
              </div>
            </div>

            {ocrData.lignes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Aucune ligne detectee dans ce document.
              </div>
            ) : (
              <div className="space-y-3">
                {ocrData.lignes.map((ligne) => {
                  const lineData = getLineData(ligne)
                  const isSelected = selectedLines.has(ligne.id)
                  const isEditing = editingLine === ligne.id

                  return (
                    <div
                      key={ligne.id}
                      className={`border rounded-lg p-4 transition-colors ${
                        isSelected ? 'border-green-300 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start space-x-4">
                        {/* Checkbox */}
                        <label className="flex items-center mt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleLineSelection(ligne.id)}
                            className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                          />
                        </label>

                        {/* Contenu */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            // Mode édition
                            <div className="grid md:grid-cols-3 gap-3">
                              <div className="md:col-span-3">
                                <label className="block text-xs text-gray-500 mb-1">Description</label>
                                <input
                                  type="text"
                                  value={lineData.description}
                                  onChange={(e) => handleEditLine(ligne.id, 'description', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Quantite</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={lineData.quantite || ''}
                                  onChange={(e) => handleEditLine(ligne.id, 'quantite', e.target.value ? parseFloat(e.target.value) : null)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Unite</label>
                                <input
                                  type="text"
                                  value={lineData.unite || ''}
                                  onChange={(e) => handleEditLine(ligne.id, 'unite', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Prix unitaire</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={lineData.prix_unitaire || ''}
                                  onChange={(e) => handleEditLine(ligne.id, 'prix_unitaire', e.target.value ? parseFloat(e.target.value) : null)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">N° Lot</label>
                                <input
                                  type="text"
                                  value={lineData.numero_lot || ''}
                                  onChange={(e) => handleEditLine(ligne.id, 'numero_lot', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                              </div>
                              <div className="flex items-end">
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={lineData.is_bio || false}
                                    onChange={(e) => handleEditLine(ligne.id, 'is_bio', e.target.checked)}
                                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 mr-2"
                                  />
                                  <span className="text-sm text-gray-700">Certifie Bio</span>
                                </label>
                              </div>
                            </div>
                          ) : (
                            // Mode affichage
                            <div>
                              <p className="font-medium text-gray-900">{lineData.description}</p>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-600">
                                {lineData.quantite !== null && (
                                  <span>{lineData.quantite} {lineData.unite || 'unite'}</span>
                                )}
                                {lineData.prix_unitaire !== null && (
                                  <span>{lineData.prix_unitaire.toFixed(2)} EUR/u</span>
                                )}
                                {lineData.prix_total !== null && (
                                  <span className="font-medium">{lineData.prix_total.toFixed(2)} EUR</span>
                                )}
                                {lineData.numero_lot && (
                                  <span className="text-gray-500">Lot: {lineData.numero_lot}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Badges et actions */}
                        <div className="flex items-center space-x-2">
                          {lineData.is_bio && (
                            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                              BIO
                            </span>
                          )}
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            lineData.confidence > 0.8
                              ? 'bg-green-100 text-green-700'
                              : lineData.confidence > 0.5
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {Math.round(lineData.confidence * 100)}%
                          </span>
                          <button
                            onClick={() => setEditingLine(isEditing ? null : ligne.id)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {isEditing ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              )}
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Recommencer
            </button>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-500">
                {selectedLines.size} ligne(s) selectionnee(s)
              </span>
              <button
                onClick={handleValidateAndSave}
                disabled={loading || selectedLines.size === 0}
                className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Valider et enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Étape 3: Validation (loading) */}
      {step === 'validate' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Enregistrement en cours...</h2>
          <p className="text-gray-600">
            Sauvegarde de {selectedLines.size} intrant(s) dans votre registre
          </p>
        </div>
      )}

      {/* Étape 4: Complete */}
      {step === 'complete' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Import termine !</h2>
          <p className="text-gray-600 mb-6">
            {savedCount} intrant(s) ont ete enregistre(s) avec succes.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={handleReset}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Scanner une autre facture
            </button>
            <a
              href="/dashboard/intrants"
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Voir mes intrants
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
