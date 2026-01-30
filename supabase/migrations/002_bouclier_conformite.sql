-- Migration 002: Bouclier de Conformité
-- Pivot vers un système de vérification active de conformité Bio

-- =============================================================================
-- 1. TABLE SUPPLIERS (Fournisseurs certifiés)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    exploitation_id UUID REFERENCES public.exploitations ON DELETE CASCADE NOT NULL,
    nom TEXT NOT NULL,
    siren TEXT,
    siret TEXT,
    adresse TEXT,
    code_postal TEXT,
    ville TEXT,
    -- Statut Bio
    statut_bio TEXT NOT NULL DEFAULT 'inconnu' CHECK (statut_bio IN ('certifie', 'en_conversion', 'non_certifie', 'inconnu')),
    numero_bio TEXT, -- Numéro de certification Bio (ex: FR-BIO-01-12345)
    organisme_certificateur TEXT,
    date_certification DATE,
    date_expiration_certificat DATE,
    -- Vérification Agence Bio
    agence_bio_id TEXT, -- ID dans l'annuaire Agence Bio
    agence_bio_verified BOOLEAN DEFAULT FALSE,
    date_derniere_verif TIMESTAMPTZ,
    url_certificat TEXT,
    -- Méta
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Contrainte d'unicité par exploitation
    UNIQUE(exploitation_id, siren)
);

-- Index pour la recherche
CREATE INDEX IF NOT EXISTS idx_suppliers_exploitation_id ON public.suppliers(exploitation_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_siren ON public.suppliers(siren);
CREATE INDEX IF NOT EXISTS idx_suppliers_nom ON public.suppliers(nom);
CREATE INDEX IF NOT EXISTS idx_suppliers_statut_bio ON public.suppliers(statut_bio);

-- RLS pour suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view suppliers of own exploitations" ON public.suppliers
    FOR SELECT USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can insert suppliers to own exploitations" ON public.suppliers
    FOR INSERT WITH CHECK (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can update suppliers of own exploitations" ON public.suppliers
    FOR UPDATE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can delete suppliers of own exploitations" ON public.suppliers
    FOR DELETE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

-- Trigger updated_at
CREATE TRIGGER update_suppliers_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. MODIFICATION TABLE INTRANTS
-- =============================================================================
-- Ajouter la colonne supplier_id si elle n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'intrants' AND column_name = 'supplier_id') THEN
        ALTER TABLE public.intrants ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Ajouter note_ia pour l'analyse Gemini
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'intrants' AND column_name = 'note_ia') THEN
        ALTER TABLE public.intrants ADD COLUMN note_ia TEXT;
    END IF;
END $$;

-- Ajouter score_conformite (0-100)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'intrants' AND column_name = 'score_conformite') THEN
        ALTER TABLE public.intrants ADD COLUMN score_conformite INTEGER CHECK (score_conformite >= 0 AND score_conformite <= 100);
    END IF;
END $$;

-- Ajouter référence au document source (facture)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'intrants' AND column_name = 'source_document_id') THEN
        ALTER TABLE public.intrants ADD COLUMN source_document_id UUID REFERENCES public.documents_storage(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Index pour les nouvelles colonnes
CREATE INDEX IF NOT EXISTS idx_intrants_supplier_id ON public.intrants(supplier_id);
CREATE INDEX IF NOT EXISTS idx_intrants_score_conformite ON public.intrants(score_conformite);
CREATE INDEX IF NOT EXISTS idx_intrants_source_document_id ON public.intrants(source_document_id);

-- =============================================================================
-- 3. MODIFICATION TABLE EXPLOITATIONS
-- =============================================================================
-- Ajouter les champs de vérification Agence Bio
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exploitations' AND column_name = 'agence_bio_verified') THEN
        ALTER TABLE public.exploitations ADD COLUMN agence_bio_verified BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exploitations' AND column_name = 'agence_bio_id') THEN
        ALTER TABLE public.exploitations ADD COLUMN agence_bio_id TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exploitations' AND column_name = 'date_verif_agence_bio') THEN
        ALTER TABLE public.exploitations ADD COLUMN date_verif_agence_bio TIMESTAMPTZ;
    END IF;
END $$;

-- Score de sécurité global (calculé)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exploitations' AND column_name = 'score_securite') THEN
        ALTER TABLE public.exploitations ADD COLUMN score_securite INTEGER DEFAULT 0 CHECK (score_securite >= 0 AND score_securite <= 100);
    END IF;
END $$;

-- =============================================================================
-- 4. MODIFICATION TABLE DOCUMENTS_STORAGE
-- =============================================================================
-- Ajouter supplier_id pour lier le document au fournisseur
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'documents_storage' AND column_name = 'supplier_id') THEN
        ALTER TABLE public.documents_storage ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Ajouter le SIREN extrait de la facture
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'documents_storage' AND column_name = 'siren_fournisseur') THEN
        ALTER TABLE public.documents_storage ADD COLUMN siren_fournisseur TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_supplier_id ON public.documents_storage(supplier_id);

-- =============================================================================
-- 5. TABLE AUDIT_LOGS (Historique des vérifications)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    exploitation_id UUID REFERENCES public.exploitations ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('verification_agence_bio', 'scan_facture', 'verification_fournisseur', 'alerte_conformite', 'pack_audit_genere')),
    entite_type TEXT, -- 'exploitation', 'supplier', 'intrant', 'document'
    entite_id UUID,
    action TEXT NOT NULL,
    details JSONB,
    resultat TEXT CHECK (resultat IN ('succes', 'echec', 'attention')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_exploitation_id ON public.audit_logs(exploitation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON public.audit_logs(type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs of own exploitations" ON public.audit_logs
    FOR SELECT USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can insert audit logs to own exploitations" ON public.audit_logs
    FOR INSERT WITH CHECK (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

-- =============================================================================
-- 6. FONCTION: Calcul du Score de Sécurité
-- =============================================================================
CREATE OR REPLACE FUNCTION calculate_security_score(p_exploitation_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_score INTEGER := 0;
    v_total_intrants INTEGER;
    v_intrants_conformes INTEGER;
    v_suppliers_certifies INTEGER;
    v_total_suppliers INTEGER;
    v_certificats_valides INTEGER;
    v_total_certificats INTEGER;
    v_exploitation_verified BOOLEAN;
BEGIN
    -- 1. Score basé sur la vérification Agence Bio de l'exploitation (20 points max)
    SELECT agence_bio_verified INTO v_exploitation_verified
    FROM exploitations WHERE id = p_exploitation_id;

    IF v_exploitation_verified THEN
        v_score := v_score + 20;
    END IF;

    -- 2. Score basé sur les intrants conformes (30 points max)
    SELECT COUNT(*), COUNT(*) FILTER (WHERE conformite_status = 'conforme')
    INTO v_total_intrants, v_intrants_conformes
    FROM intrants WHERE exploitation_id = p_exploitation_id;

    IF v_total_intrants > 0 THEN
        v_score := v_score + (30 * v_intrants_conformes / v_total_intrants);
    ELSE
        v_score := v_score + 30; -- Pas d'intrants = pas de risque
    END IF;

    -- 3. Score basé sur les fournisseurs certifiés (25 points max)
    SELECT COUNT(*), COUNT(*) FILTER (WHERE statut_bio = 'certifie')
    INTO v_total_suppliers, v_suppliers_certifies
    FROM suppliers WHERE exploitation_id = p_exploitation_id;

    IF v_total_suppliers > 0 THEN
        v_score := v_score + (25 * v_suppliers_certifies / v_total_suppliers);
    ELSE
        v_score := v_score + 25;
    END IF;

    -- 4. Score basé sur les certificats valides (25 points max)
    SELECT COUNT(*), COUNT(*) FILTER (WHERE statut = 'valide')
    INTO v_total_certificats, v_certificats_valides
    FROM certificats_fournisseurs WHERE exploitation_id = p_exploitation_id;

    IF v_total_certificats > 0 THEN
        v_score := v_score + (25 * v_certificats_valides / v_total_certificats);
    ELSE
        v_score := v_score + 25;
    END IF;

    RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 7. TRIGGER: Mise à jour automatique du score de sécurité
-- =============================================================================
CREATE OR REPLACE FUNCTION update_exploitation_security_score()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE exploitations
    SET score_securite = calculate_security_score(
        COALESCE(NEW.exploitation_id, OLD.exploitation_id)
    )
    WHERE id = COALESCE(NEW.exploitation_id, OLD.exploitation_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sur intrants
DROP TRIGGER IF EXISTS trigger_update_score_on_intrant ON public.intrants;
CREATE TRIGGER trigger_update_score_on_intrant
    AFTER INSERT OR UPDATE OR DELETE ON public.intrants
    FOR EACH ROW EXECUTE FUNCTION update_exploitation_security_score();

-- Trigger sur suppliers
DROP TRIGGER IF EXISTS trigger_update_score_on_supplier ON public.suppliers;
CREATE TRIGGER trigger_update_score_on_supplier
    AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION update_exploitation_security_score();

-- Trigger sur certificats
DROP TRIGGER IF EXISTS trigger_update_score_on_certificat ON public.certificats_fournisseurs;
CREATE TRIGGER trigger_update_score_on_certificat
    AFTER INSERT OR UPDATE OR DELETE ON public.certificats_fournisseurs
    FOR EACH ROW EXECUTE FUNCTION update_exploitation_security_score();

-- =============================================================================
-- 8. MISE À JOUR des certificats_fournisseurs pour lien avec suppliers
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'certificats_fournisseurs' AND column_name = 'supplier_id') THEN
        ALTER TABLE public.certificats_fournisseurs ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_certificats_supplier_id ON public.certificats_fournisseurs(supplier_id);
