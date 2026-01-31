-- Migration: Bio-Audit Adaptation
-- Cette migration ajoute les colonnes Bio-Audit manquantes a votre schema existant
-- A executer dans Supabase SQL Editor

-- =============================================================================
-- 1. EXTENSION pg_trgm pour Fuzzy Search
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- 2. TABLE SUPPLIERS (Fournisseurs certifies)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exploitation_id UUID REFERENCES public.exploitations ON DELETE CASCADE,
    nom TEXT NOT NULL,
    siren TEXT,
    siret TEXT,
    adresse TEXT,
    code_postal TEXT,
    ville TEXT,
    statut_bio TEXT NOT NULL DEFAULT 'inconnu' CHECK (statut_bio IN ('certifie', 'en_conversion', 'non_certifie', 'inconnu')),
    numero_bio TEXT,
    organisme_certificateur TEXT,
    date_certification DATE,
    date_expiration_certificat DATE,
    agence_bio_id TEXT,
    agence_bio_verified BOOLEAN DEFAULT FALSE,
    date_derniere_verif TIMESTAMPTZ,
    url_certificat TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_exploitation_id ON public.suppliers(exploitation_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_nom ON public.suppliers(nom);
CREATE INDEX IF NOT EXISTS idx_suppliers_nom_trgm ON public.suppliers USING gin (nom gin_trgm_ops);

-- RLS pour suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view suppliers" ON public.suppliers;
CREATE POLICY "Users can view suppliers" ON public.suppliers
    FOR SELECT USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can insert suppliers" ON public.suppliers;
CREATE POLICY "Users can insert suppliers" ON public.suppliers
    FOR INSERT WITH CHECK (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can update suppliers" ON public.suppliers;
CREATE POLICY "Users can update suppliers" ON public.suppliers
    FOR UPDATE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can delete suppliers" ON public.suppliers;
CREATE POLICY "Users can delete suppliers" ON public.suppliers
    FOR DELETE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

-- =============================================================================
-- 3. COLONNES MANQUANTES SUR INTRANTS
-- =============================================================================
ALTER TABLE public.intrants ADD COLUMN IF NOT EXISTS conformite_status TEXT CHECK (conformite_status IN ('conforme', 'attention', 'non_conforme'));
ALTER TABLE public.intrants ADD COLUMN IF NOT EXISTS conformite_raison TEXT;
ALTER TABLE public.intrants ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.intrants ADD COLUMN IF NOT EXISTS note_ia TEXT;
ALTER TABLE public.intrants ADD COLUMN IF NOT EXISTS score_conformite INTEGER CHECK (score_conformite >= 0 AND score_conformite <= 100);

-- =============================================================================
-- 4. COLONNES MANQUANTES SUR EXPLOITATIONS
-- =============================================================================
ALTER TABLE public.exploitations ADD COLUMN IF NOT EXISTS agence_bio_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.exploitations ADD COLUMN IF NOT EXISTS agence_bio_id TEXT;
ALTER TABLE public.exploitations ADD COLUMN IF NOT EXISTS date_verif_agence_bio TIMESTAMPTZ;
ALTER TABLE public.exploitations ADD COLUMN IF NOT EXISTS score_securite INTEGER DEFAULT 0 CHECK (score_securite >= 0 AND score_securite <= 100);

-- =============================================================================
-- 5. COLONNES MANQUANTES SUR PROFILES (Freemium)
-- =============================================================================
-- Note: profiles a deja verification_count et last_verification_reset
-- On va les utiliser pour le comptage des scans au lieu d'en creer de nouvelles
-- Mais on ajoute scan_limit pour la limite configurable
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS scan_limit INTEGER DEFAULT 5;

-- =============================================================================
-- 6. COLONNES MANQUANTES SUR CERTIFICATS_FOURNISSEURS
-- =============================================================================
ALTER TABLE public.certificats_fournisseurs ADD COLUMN IF NOT EXISTS numero_certificat TEXT;
ALTER TABLE public.certificats_fournisseurs ADD COLUMN IF NOT EXISTS organisme_certificateur TEXT;
ALTER TABLE public.certificats_fournisseurs ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'valide' CHECK (statut IN ('valide', 'expire', 'a_renouveler'));
ALTER TABLE public.certificats_fournisseurs ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- =============================================================================
-- 7. COLONNES MANQUANTES SUR DOCUMENTS_STORAGE
-- =============================================================================
ALTER TABLE public.documents_storage ADD COLUMN IF NOT EXISTS ocr_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.documents_storage ADD COLUMN IF NOT EXISTS ocr_data JSONB;
ALTER TABLE public.documents_storage ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.documents_storage ADD COLUMN IF NOT EXISTS siren_fournisseur TEXT;

-- =============================================================================
-- 8. FONCTION: Reset mensuel du compteur (utilise verification_count existant)
-- =============================================================================
CREATE OR REPLACE FUNCTION check_scan_limit(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_profile RECORD;
    v_current_month TIMESTAMPTZ := date_trunc('month', NOW());
    v_scan_count INTEGER;
    v_scan_limit INTEGER;
    v_can_scan BOOLEAN;
BEGIN
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profil non trouve');
    END IF;

    -- Reset si nouveau mois
    IF v_profile.last_verification_reset IS NULL OR
       date_trunc('month', v_profile.last_verification_reset) < v_current_month THEN
        UPDATE profiles
        SET verification_count = 0, last_verification_reset = NOW()
        WHERE id = p_user_id;
        v_scan_count := 0;
    ELSE
        v_scan_count := COALESCE(v_profile.verification_count, 0);
    END IF;

    -- Limite selon abonnement
    v_scan_limit := CASE
        WHEN v_profile.subscription_status IN ('active', 'pro', 'enterprise') THEN 999999
        ELSE COALESCE(v_profile.scan_limit, 5)
    END;

    v_can_scan := v_scan_count < v_scan_limit;

    RETURN jsonb_build_object(
        'success', true,
        'can_scan', v_can_scan,
        'scan_count', v_scan_count,
        'scan_limit', v_scan_limit,
        'remaining', GREATEST(0, v_scan_limit - v_scan_count),
        'is_premium', v_profile.subscription_status IN ('active', 'pro', 'enterprise')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 9. FONCTION: Incrementer le compteur de scans
-- =============================================================================
CREATE OR REPLACE FUNCTION increment_scan_count(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE profiles
    SET verification_count = COALESCE(verification_count, 0) + 1,
        last_verification_reset = COALESCE(last_verification_reset, NOW())
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 10. INDEX SUPPLEMENTAIRES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_intrants_conformite ON public.intrants(conformite_status);
CREATE INDEX IF NOT EXISTS idx_intrants_supplier_id ON public.intrants(supplier_id);
CREATE INDEX IF NOT EXISTS idx_certificats_statut ON public.certificats_fournisseurs(statut);
