import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Exploitation, Intrant, DocumentStorage, Supplier, CertificatFournisseur, ScoreSecurite } from '@/types/database'

interface PackAuditData {
  exploitation: Exploitation
  periode: { debut: string; fin: string }
  intrants: Intrant[]
  documents: DocumentStorage[]
  suppliers: Supplier[]
  certificats: CertificatFournisseur[]
  scoreSecurite: ScoreSecurite | null
}

export function generatePackAuditPDF(data: PackAuditData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let yPos = 20

  // Couleurs
  const greenPrimary: [number, number, number] = [22, 163, 74] // green-600
  const greenDark: [number, number, number] = [21, 128, 61] // green-700
  const grayDark: [number, number, number] = [31, 41, 55]
  const grayMedium: [number, number, number] = [107, 114, 128]

  // ============================================
  // PAGE 1: COUVERTURE
  // ============================================

  // Bandeau header vert
  doc.setFillColor(...greenPrimary)
  doc.rect(0, 0, pageWidth, 40, 'F')

  // Logo/Titre
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text('Bio-Audit', 20, 25)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text('Bouclier de Conformite', 20, 33)

  // Titre principal
  yPos = 65
  doc.setTextColor(...grayDark)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('PACK AUDIT', pageWidth / 2, yPos, { align: 'center' })

  yPos += 12
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text('Dossier de Conformite Agriculture Biologique', pageWidth / 2, yPos, { align: 'center' })

  // Cadre exploitation
  yPos += 25
  doc.setFillColor(249, 250, 251)
  doc.roundedRect(20, yPos, pageWidth - 40, 50, 3, 3, 'F')
  doc.setDrawColor(...greenPrimary)
  doc.setLineWidth(0.5)
  doc.roundedRect(20, yPos, pageWidth - 40, 50, 3, 3, 'S')

  yPos += 15
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...greenDark)
  doc.text(data.exploitation.name, pageWidth / 2, yPos, { align: 'center' })

  yPos += 10
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grayMedium)
  if (data.exploitation.siret) {
    doc.text(`SIRET: ${data.exploitation.siret}`, pageWidth / 2, yPos, { align: 'center' })
    yPos += 6
  }
  if (data.exploitation.num_agrement_bio) {
    doc.text(`N° Agrement Bio: ${data.exploitation.num_agrement_bio}`, pageWidth / 2, yPos, { align: 'center' })
    yPos += 6
  }
  if (data.exploitation.ville) {
    doc.text(`${data.exploitation.adresse || ''} - ${data.exploitation.code_postal || ''} ${data.exploitation.ville}`, pageWidth / 2, yPos, { align: 'center' })
  }

  // Periode
  yPos += 35
  doc.setFontSize(14)
  doc.setTextColor(...grayDark)
  doc.setFont('helvetica', 'bold')
  doc.text('Periode auditee', pageWidth / 2, yPos, { align: 'center' })

  yPos += 10
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  const dateDebut = new Date(data.periode.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const dateFin = new Date(data.periode.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(`Du ${dateDebut} au ${dateFin}`, pageWidth / 2, yPos, { align: 'center' })

  // Score de securite
  if (data.scoreSecurite) {
    yPos += 30
    doc.setFillColor(...greenPrimary)
    doc.roundedRect(pageWidth / 2 - 30, yPos, 60, 35, 5, 5, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(28)
    doc.setFont('helvetica', 'bold')
    doc.text(`${data.scoreSecurite.global}`, pageWidth / 2, yPos + 20, { align: 'center' })

    doc.setFontSize(10)
    doc.text('Score Securite', pageWidth / 2, yPos + 30, { align: 'center' })
  }

  // Resume
  yPos += 55
  doc.setTextColor(...grayDark)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Resume du dossier', 20, yPos)

  yPos += 10
  const summaryData = [
    ['Intrants enregistres', String(data.intrants.length)],
    ['Documents archives', String(data.documents.length)],
    ['Fournisseurs', String(data.suppliers.length)],
    ['Certificats', String(data.certificats.length)],
  ]

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  summaryData.forEach(([label, value]) => {
    doc.setTextColor(...grayMedium)
    doc.text(label, 25, yPos)
    doc.setTextColor(...greenDark)
    doc.setFont('helvetica', 'bold')
    doc.text(value, 100, yPos)
    doc.setFont('helvetica', 'normal')
    yPos += 7
  })

  // Footer
  doc.setTextColor(...grayMedium)
  doc.setFontSize(9)
  doc.text(
    `Genere le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}`,
    pageWidth / 2,
    280,
    { align: 'center' }
  )
  doc.text('Bio-Audit - Bouclier de Conformite', pageWidth / 2, 286, { align: 'center' })

  // ============================================
  // PAGE 2: REGISTRE DES INTRANTS
  // ============================================
  if (data.intrants.length > 0) {
    doc.addPage()
    yPos = 20

    // Header
    doc.setFillColor(...greenPrimary)
    doc.rect(0, 0, pageWidth, 25, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Registre des Intrants', 20, 17)

    yPos = 35

    // Tableau des intrants
    const intrantsTableData = data.intrants.map((intrant) => {
      const conformiteBadge = intrant.conformite_status === 'conforme' ? 'OK' :
        intrant.conformite_status === 'attention' ? '!' :
        intrant.conformite_status === 'non_conforme' ? 'X' : '-'

      return [
        new Date(intrant.date_achat).toLocaleDateString('fr-FR'),
        intrant.produit_nom.substring(0, 30),
        intrant.fournisseur?.substring(0, 20) || '-',
        `${intrant.quantite} ${intrant.unite}`,
        intrant.type_intrant,
        intrant.est_bio ? 'Oui' : 'Non',
        conformiteBadge,
      ]
    })

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Produit', 'Fournisseur', 'Quantite', 'Type', 'Bio', 'Conf.']],
      body: intrantsTableData,
      theme: 'striped',
      headStyles: {
        fillColor: greenPrimary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: grayDark,
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 45 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25 },
        5: { cellWidth: 15 },
        6: { cellWidth: 15 },
      },
      margin: { left: 15, right: 15 },
    })
  }

  // ============================================
  // PAGE 3: FOURNISSEURS
  // ============================================
  if (data.suppliers.length > 0) {
    doc.addPage()
    yPos = 20

    // Header
    doc.setFillColor(...greenPrimary)
    doc.rect(0, 0, pageWidth, 25, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Fournisseurs Certifies', 20, 17)

    yPos = 35

    // Tableau des fournisseurs
    const suppliersTableData = data.suppliers.map((supplier) => {
      const statutLabel = supplier.statut_bio === 'certifie' ? 'Certifie Bio' :
        supplier.statut_bio === 'en_conversion' ? 'En conversion' :
        supplier.statut_bio === 'non_certifie' ? 'Non certifie' : 'Inconnu'

      return [
        supplier.nom.substring(0, 35),
        supplier.siren || '-',
        supplier.ville || '-',
        statutLabel,
        supplier.agence_bio_verified ? 'Oui' : 'Non',
        supplier.organisme_certificateur?.substring(0, 15) || '-',
      ]
    })

    autoTable(doc, {
      startY: yPos,
      head: [['Nom', 'SIREN', 'Ville', 'Statut Bio', 'Verifie', 'Organisme']],
      body: suppliersTableData,
      theme: 'striped',
      headStyles: {
        fillColor: greenPrimary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: grayDark,
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      margin: { left: 15, right: 15 },
    })
  }

  // ============================================
  // PAGE 4: CERTIFICATS
  // ============================================
  if (data.certificats.length > 0) {
    doc.addPage()
    yPos = 20

    // Header
    doc.setFillColor(...greenPrimary)
    doc.rect(0, 0, pageWidth, 25, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Certificats Fournisseurs', 20, 17)

    yPos = 35

    // Tableau des certificats
    const certsTableData = data.certificats.map((cert) => {
      const statutColor = cert.statut === 'valide' ? 'Valide' :
        cert.statut === 'expire' ? 'Expire' : 'A renouveler'

      return [
        cert.fournisseur_nom.substring(0, 30),
        cert.numero_certificat || '-',
        cert.organisme_certificateur?.substring(0, 15) || '-',
        cert.date_expiration ? new Date(cert.date_expiration).toLocaleDateString('fr-FR') : '-',
        statutColor,
      ]
    })

    autoTable(doc, {
      startY: yPos,
      head: [['Fournisseur', 'N° Certificat', 'Organisme', 'Expiration', 'Statut']],
      body: certsTableData,
      theme: 'striped',
      headStyles: {
        fillColor: greenPrimary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: grayDark,
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      margin: { left: 15, right: 15 },
    })
  }

  // ============================================
  // PAGE 5: DOCUMENTS ARCHIVES
  // ============================================
  if (data.documents.length > 0) {
    doc.addPage()
    yPos = 20

    // Header
    doc.setFillColor(...greenPrimary)
    doc.rect(0, 0, pageWidth, 25, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Documents Archives', 20, 17)

    yPos = 35

    // Tableau des documents
    const docsTableData = data.documents.map((doc) => {
      const typeLabel = doc.type_doc === 'facture' ? 'Facture' :
        doc.type_doc === 'certificat' ? 'Certificat' :
        doc.type_doc === 'bon_livraison' ? 'BL' :
        doc.type_doc === 'analyse' ? 'Analyse' : 'Autre'

      return [
        doc.nom_fichier.substring(0, 40),
        typeLabel,
        new Date(doc.created_at).toLocaleDateString('fr-FR'),
        doc.ocr_processed ? 'Oui' : 'Non',
        doc.conservation_jusqu_a ? new Date(doc.conservation_jusqu_a).toLocaleDateString('fr-FR') : '-',
      ]
    })

    autoTable(doc, {
      startY: yPos,
      head: [['Fichier', 'Type', 'Date ajout', 'OCR', 'Conservation']],
      body: docsTableData,
      theme: 'striped',
      headStyles: {
        fillColor: greenPrimary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: grayDark,
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      margin: { left: 15, right: 15 },
    })
  }

  // ============================================
  // DERNIERE PAGE: MENTIONS LEGALES
  // ============================================
  doc.addPage()
  yPos = 20

  doc.setFillColor(...greenPrimary)
  doc.rect(0, 0, pageWidth, 25, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Informations Legales', 20, 17)

  yPos = 40
  doc.setTextColor(...grayDark)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Reglements applicables', 20, yPos)

  yPos += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const reglements = [
    'Reglement (UE) 2018/848 - Production biologique et etiquetage',
    'Reglement (UE) 2017/625 - Controles officiels',
    'Code rural et de la peche maritime - Articles L. 641-13 et suivants',
    'Cahier des charges de l\'agriculture biologique',
  ]
  reglements.forEach((reg) => {
    doc.text(`• ${reg}`, 25, yPos)
    yPos += 6
  })

  yPos += 15
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Conservation des documents', 20, yPos)

  yPos += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Les documents relatifs a la certification biologique doivent etre conserves', 25, yPos)
  yPos += 5
  doc.text('pendant une duree minimale de 5 ans a compter de leur emission.', 25, yPos)

  yPos += 20
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Avertissement', 20, yPos)

  yPos += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Ce document est genere automatiquement par Bio-Audit et ne constitue pas', 25, yPos)
  yPos += 5
  doc.text('une certification officielle. Il doit etre presente accompagne des documents', 25, yPos)
  yPos += 5
  doc.text('originaux lors d\'un controle par les autorites competentes.', 25, yPos)

  // Footer toutes pages
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(...grayMedium)
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - 20, 290, { align: 'right' })
  }

  return doc
}

export function downloadPackAuditPDF(data: PackAuditData, filename?: string): void {
  const doc = generatePackAuditPDF(data)
  const defaultFilename = `pack-audit-${data.exploitation.name.replace(/\s+/g, '-')}-${new Date().getFullYear()}.pdf`
  doc.save(filename || defaultFilename)
}
