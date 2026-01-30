'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useExploitation } from '@/contexts/ExploitationContext'
import { getConformityBadge } from '@/lib/gemini'

interface ScanResult {
  success: boolean
  data?: {
    fournisseur: string
    date_facture: string
    numero_facture: string
    lignes: Array<{
      nom: string
      quantite: number
      unite: string
      prix_unitaire: number
      prix_total: number
      est_bio: boolean
      conformite_status: 'conforme' | 'attention' | 'non_conforme' | null
      conformite_raison?: string
    }>
    verification_fournisseur?: {
      found: boolean
      statut_bio: string
      nom_officiel: string
    }
  }
  conformity?: {
    score: number
    status: 'conforme' | 'attention' | 'non_conforme'
  }
  error?: string
  code?: string
  upgrade_message?: string
  upgrade_url?: string
  remaining?: number
  scan_limit?: number
}

export default function ScanPage() {
  const { activeExploitation } = useExploitation()
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [usageInfo, setUsageInfo] = useState<{ remaining: number; scan_limit: number; is_premium: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Charger les infos d'usage au montage
  useEffect(() => {
    fetch('/api/usage')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setUsageInfo({
            remaining: data.remaining,
            scan_limit: data.scan_limit,
            is_premium: data.is_premium
          })
        }
      })
      .catch(console.error)
  }, [])

  const startCamera = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Camera arriere sur mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCameraActive(true)
    } catch (err) {
      console.error('Erreur camera:', err)
      setError('Impossible d\'acceder a la camera. Verifiez les permissions.')
    }
  }

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }, [])

  const capturePhoto = async () => {
    if (!videoRef.current) return

    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(videoRef.current, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' })
      await processFile(file)
      stopCamera()
    }, 'image/jpeg', 0.9)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await processFile(file)
    }
  }

  const processFile = async (file: File) => {
    if (!activeExploitation) {
      setError('Veuillez d\'abord selectionner une exploitation')
      return
    }

    setIsScanning(true)
    setError(null)
    setScanResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('exploitationId', activeExploitation.id)

      const response = await fetch('/api/ocr/analyze', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        if (result.code === 'SCAN_LIMIT_REACHED') {
          setScanResult({
            success: false,
            error: result.error,
            code: result.code,
            upgrade_message: result.upgrade_message,
            upgrade_url: result.upgrade_url,
            remaining: result.remaining,
            scan_limit: result.scan_limit,
          })
        } else {
          setError(result.error || 'Erreur lors de l\'analyse')
        }
        return
      }

      setScanResult(result)

      // Mettre a jour le compteur d'usage
      if (usageInfo) {
        setUsageInfo({
          ...usageInfo,
          remaining: Math.max(0, usageInfo.remaining - 1)
        })
      }
    } catch (err) {
      console.error('Erreur scan:', err)
      setError('Erreur de connexion. Verifiez votre reseau.')
    } finally {
      setIsScanning(false)
    }
  }

  const resetScan = () => {
    setScanResult(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  if (!activeExploitation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Exploitation requise</h2>
          <p className="text-gray-600">Selectionnez une exploitation dans le menu pour scanner vos documents.</p>
        </div>
      </div>
    )
  }

  // Affichage limite atteinte
  if (scanResult?.code === 'SCAN_LIMIT_REACHED') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-orange-50 to-white">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 mx-auto mb-6 bg-orange-100 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Limite atteinte</h2>
          <p className="text-gray-600 mb-6">{scanResult.upgrade_message}</p>
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 mb-6">
            <div className="text-4xl font-bold text-green-600 mb-2">20 euros/mois</div>
            <p className="text-gray-500 text-sm">ou 200 euros/an (2 mois offerts)</p>
            <ul className="text-left mt-4 space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Scans illimites
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Pack Audit PDF
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Support prioritaire
              </li>
            </ul>
          </div>
          <a
            href={scanResult.upgrade_url || '/dashboard/settings?tab=abonnement'}
            className="block w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-green-200 active:scale-95 transition-transform"
          >
            Passer a Premium
          </a>
          <button
            onClick={resetScan}
            className="mt-4 text-gray-500 hover:text-gray-700"
          >
            Retour
          </button>
        </div>
      </div>
    )
  }

  // Affichage resultat
  if (scanResult?.success && scanResult.data) {
    const conformityBadge = scanResult.conformity
      ? getConformityBadge(scanResult.conformity.status)
      : null

    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        {/* Header resultat */}
        <div className={`p-6 ${
          scanResult.conformity?.status === 'conforme' ? 'bg-green-600' :
          scanResult.conformity?.status === 'attention' ? 'bg-orange-500' : 'bg-red-600'
        }`}>
          <div className="text-center text-white">
            <div className="text-5xl mb-2">
              {conformityBadge?.emoji || '✅'}
            </div>
            <h2 className="text-2xl font-bold">{conformityBadge?.label || 'Analyse terminee'}</h2>
            {scanResult.conformity && (
              <p className="text-white/80 mt-1">Score: {scanResult.conformity.score}%</p>
            )}
          </div>
        </div>

        {/* Infos facture */}
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">Facture</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Fournisseur</span>
                <span className="font-medium">{scanResult.data.fournisseur || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="font-medium">{scanResult.data.date_facture || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Numero</span>
                <span className="font-medium">{scanResult.data.numero_facture || '-'}</span>
              </div>
              {scanResult.data.verification_fournisseur?.found && (
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-gray-500">Statut Bio fournisseur</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    scanResult.data.verification_fournisseur.statut_bio === 'certifie'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}>
                    {scanResult.data.verification_fournisseur.statut_bio === 'certifie' ? '🟢 Certifie' : '🟠 ' + scanResult.data.verification_fournisseur.statut_bio}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Lignes */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">
              Produits ({scanResult.data.lignes.length})
            </h3>
            <div className="space-y-3">
              {scanResult.data.lignes.map((ligne, i) => {
                const badge = getConformityBadge(ligne.conformite_status)
                return (
                  <div key={i} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{badge.emoji}</span>
                        <span className="font-medium text-gray-900">{ligne.nom}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {ligne.quantite} {ligne.unite} - {ligne.prix_total?.toFixed(2) || '?'} euros
                        {ligne.est_bio && ' - Bio'}
                      </p>
                      {ligne.conformite_raison && (
                        <p className={`text-xs mt-1 ${badge.color}`}>{ligne.conformite_raison}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Actions flottantes */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 safe-area-pb">
          <div className="flex gap-3">
            <button
              onClick={resetScan}
              className="flex-1 py-4 px-6 bg-gray-100 text-gray-700 rounded-2xl font-bold text-lg active:scale-95 transition-transform"
            >
              Nouveau scan
            </button>
            <button
              className="flex-1 py-4 px-6 bg-green-600 text-white rounded-2xl font-bold text-lg active:scale-95 transition-transform"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Affichage camera
  if (cameraActive) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex flex-col">
          {/* Guide de cadrage */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-[85%] aspect-[3/4] border-2 border-white/50 rounded-lg" />
          </div>

          {/* Boutons */}
          <div className="p-6 safe-area-pb flex items-center justify-center gap-6">
            <button
              onClick={stopCamera}
              className="w-14 h-14 bg-white/20 backdrop-blur rounded-full flex items-center justify-center active:scale-95 transition-transform"
            >
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              onClick={capturePhoto}
              disabled={isScanning}
              className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-50"
            >
              {isScanning ? (
                <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <div className="w-16 h-16 bg-green-600 rounded-full" />
              )}
            </button>
            <div className="w-14 h-14" /> {/* Spacer */}
          </div>
        </div>
      </div>
    )
  }

  // Ecran principal
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white p-4 pb-24">
      {/* Header */}
      <div className="text-center mb-8 pt-4">
        <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Scanner une facture</h1>
        <p className="text-gray-600 mt-1">Analysez vos documents en un instant</p>
      </div>

      {/* Compteur de scans */}
      {usageInfo && !usageInfo.is_premium && (
        <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Scans restants ce mois</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${usageInfo.remaining <= 1 ? 'text-red-600' : 'text-green-600'}`}>
                {usageInfo.remaining}
              </span>
              <span className="text-gray-400">/ {usageInfo.scan_limit}</span>
            </div>
          </div>
          {usageInfo.remaining <= 2 && (
            <a href="/dashboard/settings?tab=abonnement" className="block mt-3 text-center text-sm text-green-600 font-medium">
              Passer a Premium pour des scans illimites →
            </a>
          )}
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Boutons d'action massifs */}
      <div className="space-y-4">
        {/* Bouton Camera */}
        <button
          onClick={startCamera}
          disabled={isScanning}
          className="w-full py-6 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-3xl font-bold text-xl shadow-lg shadow-green-200 active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-4"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Prendre une photo
        </button>

        {/* Separateur */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-400 text-sm">ou</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Bouton Fichier */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanning}
          className="w-full py-6 px-6 bg-white border-2 border-gray-200 text-gray-700 rounded-3xl font-bold text-xl active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-4"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Choisir un fichier
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Loading */}
      {isScanning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 text-center max-w-xs">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Analyse en cours</h3>
            <p className="text-gray-600 text-sm">L&apos;IA analyse votre document...</p>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 space-y-3">
        <h3 className="font-bold text-gray-900">Conseils pour un bon scan</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Document bien eclaire et net
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Tout le document visible dans le cadre
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Eviter les reflets et ombres
          </li>
        </ul>
      </div>
    </div>
  )
}
