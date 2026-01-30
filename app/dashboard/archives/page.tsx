'use client'

import { useState, useEffect, useCallback } from 'react'
import { useExploitation } from '@/contexts/ExploitationContext'
import { createClient } from '@/lib/supabase'
import { downloadPackAuditPDF } from '@/lib/pdf-generator'
import type { DocumentStorage, Supplier, CertificatFournisseur, Intrant, ScoreSecurite } from '@/types/database'

export default function ArchivesPage() {
  const { activeExploitation } = useExploitation()
  const [documents, setDocuments] = useState<DocumentStorage[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [generatingPack, setGeneratingPack] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const supabase = createClient()

  const loadDocuments = useCallback(async () => {
    if (!activeExploitation) return

    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('documents_storage')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .order('created_at', { ascending: false })

      if (fetchError) {
        if (fetchError.code === '42P01') {
          setError('Table documents_storage non trouvee')
        } else {
          setError(fetchError.message)
        }
        setDocuments([])
      } else {
        setDocuments(data || [])
      }
    } catch (err) {
      console.error('Erreur chargement documents:', err)
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }, [activeExploitation, supabase])

  useEffect(() => {
    if (activeExploitation) {
      loadDocuments()
    }
  }, [activeExploitation, loadDocuments])

  const getDocTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      facture: 'Facture',
      certificat: 'Certificat',
      bon_livraison: 'Bon de livraison',
      analyse: 'Analyse',
      autre: 'Autre',
    }
    return labels[type] || type
  }

  const getDocTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      facture: 'bg-blue-100 text-blue-800',
      certificat: 'bg-green-100 text-green-800',
      bon_livraison: 'bg-purple-100 text-purple-800',
      analyse: 'bg-orange-100 text-orange-800',
      autre: 'bg-gray-100 text-gray-800',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  const filteredDocuments = documents.filter(doc =>
    filter === 'all' ? true : doc.type_doc === filter
  )

  const generateAuditPack = async () => {
    if (!activeExploitation) return

    setGeneratingPack(true)
    setError(null)
    setSuccess(null)

    try {
      const currentYear = new Date().getFullYear()
      const yearStart = `${currentYear}-01-01`
      const yearEnd = `${currentYear}-12-31`

      // Recuperer tous les documents de l'annee
      const { data: yearDocs, error: docsError } = await supabase
        .from('documents_storage')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .gte('created_at', yearStart)
        .lte('created_at', yearEnd)

      if (docsError && docsError.code !== '42P01') {
        console.error('Erreur documents:', docsError)
      }

      // Recuperer les certificats
      const { data: certs, error: certsError } = await supabase
        .from('certificats_fournisseurs')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)

      if (certsError && certsError.code !== '42P01') {
        console.error('Erreur certificats:', certsError)
      }

      // Recuperer les intrants
      const { data: intrants, error: intrantsError } = await supabase
        .from('intrants')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)
        .gte('date_achat', yearStart)
        .lte('date_achat', yearEnd)

      if (intrantsError && intrantsError.code !== '42P01') {
        console.error('Erreur intrants:', intrantsError)
      }

      // Recuperer les fournisseurs
      const { data: suppliers, error: suppliersError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('exploitation_id', activeExploitation.id)

      if (suppliersError && suppliersError.code !== '42P01') {
        console.error('Erreur fournisseurs:', suppliersError)
      }

      // Calculer le score de securite
      const intrantsList = (intrants || []) as Intrant[]
      const suppliersList = (suppliers || []) as Supplier[]
      const certsList = (certs || []) as CertificatFournisseur[]

      const intrantsConformes = intrantsList.filter(i => i.conformite_status === 'conforme').length
      const suppliersCertifies = suppliersList.filter(s => s.statut_bio === 'certifie').length
      const certsValides = certsList.filter(c => c.statut === 'valide').length

      const scoreDetails = {
        exploitation_verifiee: {
          score: activeExploitation.agence_bio_verified ? 20 : 0,
          max: 20,
          status: activeExploitation.agence_bio_verified || false
        },
        intrants_conformes: {
          score: intrantsList.length > 0 ? Math.round(30 * intrantsConformes / intrantsList.length) : 30,
          max: 30,
          ratio: `${intrantsConformes}/${intrantsList.length}`
        },
        fournisseurs_certifies: {
          score: suppliersList.length > 0 ? Math.round(25 * suppliersCertifies / suppliersList.length) : 25,
          max: 25,
          ratio: `${suppliersCertifies}/${suppliersList.length}`
        },
        certificats_valides: {
          score: certsList.length > 0 ? Math.round(25 * certsValides / certsList.length) : 25,
          max: 25,
          ratio: `${certsValides}/${certsList.length}`
        }
      }

      const globalScore = scoreDetails.exploitation_verifiee.score +
        scoreDetails.intrants_conformes.score +
        scoreDetails.fournisseurs_certifies.score +
        scoreDetails.certificats_valides.score

      const scoreSecurite: ScoreSecurite = {
        global: globalScore,
        details: scoreDetails,
        alertes: [],
        recommandations: [],
        derniere_maj: new Date().toISOString()
      }

      // Generer le PDF
      downloadPackAuditPDF({
        exploitation: activeExploitation,
        periode: { debut: yearStart, fin: yearEnd },
        intrants: intrantsList,
        documents: (yearDocs || []) as DocumentStorage[],
        suppliers: suppliersList,
        certificats: certsList,
        scoreSecurite,
      })

      setSuccess(`Pack Audit PDF ${currentYear} genere avec succes!

Contenu:
- ${intrantsList.length} intrants
- ${(yearDocs || []).length} documents
- ${suppliersList.length} fournisseurs
- ${certsList.length} certificats
- Score de securite: ${globalScore}/100`)

      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      console.error('Erreur generation pack:', err)
      setError('Erreur lors de la generation du PDF')
    } finally {
      setGeneratingPack(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Selectionnez une exploitation pour acceder aux archives.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Archives Legales</h1>
          <p className="text-gray-600">Conservation et export de vos documents de conformite</p>
        </div>
        <button
          onClick={generateAuditPack}
          disabled={generatingPack}
          className="flex items-center px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-green-200 font-medium"
        >
          {generatingPack ? (
            <>
              <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generation PDF...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Telecharger Pack Audit PDF
            </>
          )}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <pre className="text-green-800 text-sm whitespace-pre-wrap">{success}</pre>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-medium text-blue-900">Conservation legale</h3>
            <p className="text-sm text-blue-700 mt-1">
              Les documents Bio doivent etre conserves 5 ans minimum (reglement UE 2018/848).
              Le Pack Audit genere un PDF professionnel pour presentation a un auditeur.
            </p>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500">Filtrer:</span>
        {['all', 'facture', 'certificat', 'bon_livraison', 'analyse', 'autre'].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              filter === type
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {type === 'all' ? 'Tous' : getDocTypeLabel(type)}
          </button>
        ))}
      </div>

      {/* Liste des documents */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Documents archives ({filteredDocuments.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="font-medium">Aucun document archive</p>
            <p className="text-sm mt-1">Scannez vos factures pour les archiver automatiquement</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredDocuments.map((doc) => (
              <div key={doc.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                      {doc.mime_type.includes('pdf') ? (
                        <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8.5 13H10v4H8.5v-4zm2.5 0h1.5v4H11v-4zm2.5 0h1.5v4H13.5v-4z" />
                        </svg>
                      ) : doc.mime_type.includes('image') ? (
                        <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{doc.nom_fichier}</h3>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getDocTypeColor(doc.type_doc)}`}>
                          {getDocTypeLabel(doc.type_doc)}
                        </span>
                        <span className="text-sm text-gray-500">{formatFileSize(doc.taille)}</span>
                        {doc.ocr_processed && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                            OCR traite
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-sm text-gray-500">
                        <span>Ajoute le {new Date(doc.created_at).toLocaleDateString('fr-FR')}</span>
                        {doc.conservation_jusqu_a && (
                          <span className="ml-4">
                            Conservation jusqu&apos;au {new Date(doc.conservation_jusqu_a).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const { data } = await supabase.storage
                          .from('documents')
                          .createSignedUrl(doc.storage_path, 3600)
                        if (data?.signedUrl) {
                          window.open(data.signedUrl, '_blank')
                        }
                      }}
                      className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Telecharger"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
