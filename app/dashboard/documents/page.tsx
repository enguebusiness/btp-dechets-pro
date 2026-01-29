'use client'

import Link from 'next/link'
import { useExploitation } from '@/contexts/ExploitationContext'

export default function DocumentsPage() {
  const { activeExploitation } = useExploitation()

  if (!activeExploitation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Selectionnez une exploitation.</p>
      </div>
    )
  }

  const documentTypes = [
    {
      title: 'Coffre-fort',
      description: 'Stockez vos documents en toute securite',
      icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
      href: '/dashboard/coffre-fort',
      color: 'bg-purple-100 text-purple-600',
    },
    {
      title: 'MangeTout OCR',
      description: 'Scannez et importez vos factures automatiquement',
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      href: '/dashboard/mangetout',
      color: 'bg-blue-100 text-blue-600',
    },
    {
      title: 'Certificats fournisseurs',
      description: 'Gerez les certificats bio de vos fournisseurs',
      icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
      href: '/dashboard/certificats',
      color: 'bg-green-100 text-green-600',
    },
    {
      title: 'Bilan matiere',
      description: 'Consultez et exportez vos bilans',
      icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
      href: '/dashboard/bilan',
      color: 'bg-amber-100 text-amber-600',
    },
    {
      title: 'Registre',
      description: 'Tracabilite complete de votre exploitation',
      icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
      href: '/dashboard/registre',
      color: 'bg-red-100 text-red-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-600">Accedez a tous vos documents et outils de gestion</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documentTypes.map((doc) => (
          <Link
            key={doc.href}
            href={doc.href}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow group"
          >
            <div className={`w-12 h-12 rounded-lg ${doc.color} flex items-center justify-center mb-4`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={doc.icon} />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
              {doc.title}
            </h3>
            <p className="text-gray-600 mt-1">{doc.description}</p>
          </Link>
        ))}
      </div>

      {/* Aide */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white">
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-lg">Besoin d&apos;aide ?</h3>
            <p className="text-green-100 mt-1">
              Consultez notre documentation pour comprendre comment organiser vos documents et assurer votre conformite bio.
            </p>
            <button className="mt-4 px-4 py-2 bg-white text-green-600 rounded-lg font-medium hover:bg-green-50 transition-colors">
              Voir la documentation
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
