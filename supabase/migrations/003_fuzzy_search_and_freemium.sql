-- Migration 003: Fuzzy Search et Business Model Freemium
-- Active la recherche floue et le comptage des scans

-- =============================================================================
-- 1. ACTIVATION DE pg_trgm POUR FUZZY SEARCH
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index trigram pour la recherche floue sur suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_nom_trgm ON public.suppliers USING gin (nom gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_ville_trgm ON public.suppliers USING gin (ville gin_trgm_ops);

-- =============================================================================
-- 2. FONCTION DE RECHERCHE FLOUE FOURNISSEURS
-- =============================================================================
CREATE OR REPLACE FUNCTION search_suppliers_fuzzy(
    p_exploitation_id UUID,
    p_search_term TEXT,
    p_code_postal TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    nom TEXT,
    siren TEXT,
    siret TEXT,
    ville TEXT,
    code_postal TEXT,
    statut_bio TEXT,
    agence_bio_verified BOOLEAN,
    similarity_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.nom,
        s.siren,
        s.siret,
        s.ville,
        s.code_postal,
        s.statut_bio,
        s.agence_bio_verified,
        GREATEST(
            similarity(s.nom, p_search_term),
            similarity(COALESCE(s.ville, ''), p_search_term)
        ) AS similarity_score
    FROM public.suppliers s
    WHERE s.exploitation_id = p_exploitation_id
      AND (
          s.nom ILIKE '%' || p_search_term || '%'
          OR s.nom % p_search_term  -- Trigram similarity
          OR s.ville ILIKE '%' || p_search_term || '%'
          OR s.siren ILIKE '%' || p_search_term || '%'
          OR (p_code_postal IS NOT NULL AND s.code_postal = p_code_postal)
      )
    ORDER BY similarity_score DESC, s.nom
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 3. COLONNES FREEMIUM SUR PROFILES
-- =============================================================================
-- Ajouter compteur de scans mensuels
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'scan_count_month') THEN
        ALTER TABLE public.profiles ADD COLUMN scan_count_month INTEGER DEFAULT 0;
    END IF;
END $$;

-- Ajouter mois de référence pour reset
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'scan_month_ref') THEN
        ALTER TABLE public.profiles ADD COLUMN scan_month_ref TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM');
    END IF;
END $$;

-- Ajouter limite de scans (5 pour free, illimité pour pro)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'scan_limit') THEN
        ALTER TABLE public.profiles ADD COLUMN scan_limit INTEGER DEFAULT 5;
    END IF;
END $$;

-- =============================================================================
-- 4. FONCTION: Vérifier et Incrémenter le Compteur de Scans
-- =============================================================================
CREATE OR REPLACE FUNCTION check_and_increment_scan(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_profile RECORD;
    v_current_month TEXT := TO_CHAR(NOW(), 'YYYY-MM');
    v_scan_count INTEGER;
    v_scan_limit INTEGER;
    v_can_scan BOOLEAN;
BEGIN
    -- Récupérer le profil
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Profil non trouvé',
            'can_scan', false
        );
    END IF;

    -- Si le mois a changé, reset le compteur
    IF v_profile.scan_month_ref IS NULL OR v_profile.scan_month_ref != v_current_month THEN
        UPDATE profiles
        SET scan_count_month = 0, scan_month_ref = v_current_month
        WHERE id = p_user_id;
        v_scan_count := 0;
    ELSE
        v_scan_count := COALESCE(v_profile.scan_count_month, 0);
    END IF;

    -- Déterminer la limite (illimité = 999999 pour pro/enterprise)
    v_scan_limit := CASE
        WHEN v_profile.subscription_status IN ('pro', 'enterprise') THEN 999999
        ELSE COALESCE(v_profile.scan_limit, 5)
    END;

    -- Vérifier si on peut scanner
    v_can_scan := v_scan_count < v_scan_limit;

    IF v_can_scan THEN
        -- Incrémenter le compteur
        UPDATE profiles
        SET scan_count_month = scan_count_month + 1
        WHERE id = p_user_id;
        v_scan_count := v_scan_count + 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'can_scan', v_can_scan,
        'scan_count', v_scan_count,
        'scan_limit', v_scan_limit,
        'remaining', GREATEST(0, v_scan_limit - v_scan_count),
        'is_premium', v_profile.subscription_status IN ('pro', 'enterprise'),
        'month', v_current_month
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. FONCTION: Obtenir l'usage du mois
-- =============================================================================
CREATE OR REPLACE FUNCTION get_scan_usage(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_profile RECORD;
    v_current_month TEXT := TO_CHAR(NOW(), 'YYYY-MM');
    v_scan_count INTEGER;
    v_scan_limit INTEGER;
BEGIN
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Profil non trouvé');
    END IF;

    -- Reset si nouveau mois
    IF v_profile.scan_month_ref IS NULL OR v_profile.scan_month_ref != v_current_month THEN
        v_scan_count := 0;
    ELSE
        v_scan_count := COALESCE(v_profile.scan_count_month, 0);
    END IF;

    v_scan_limit := CASE
        WHEN v_profile.subscription_status IN ('pro', 'enterprise') THEN 999999
        ELSE COALESCE(v_profile.scan_limit, 5)
    END;

    RETURN jsonb_build_object(
        'scan_count', v_scan_count,
        'scan_limit', v_scan_limit,
        'remaining', GREATEST(0, v_scan_limit - v_scan_count),
        'is_premium', v_profile.subscription_status IN ('pro', 'enterprise'),
        'subscription_status', v_profile.subscription_status,
        'month', v_current_month
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 6. MISE À JOUR DES EXPLOITATIONS POUR SYNC STRIPE
-- =============================================================================
-- Ajouter colonne pour plan tarifaire
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exploitations' AND column_name = 'plan') THEN
        ALTER TABLE public.exploitations ADD COLUMN plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise'));
    END IF;
END $$;

-- Ajouter date de fin d'abonnement
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exploitations' AND column_name = 'subscription_end_date') THEN
        ALTER TABLE public.exploitations ADD COLUMN subscription_end_date TIMESTAMPTZ;
    END IF;
END $$;

-- =============================================================================
-- 7. INDEX POUR PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_subscription ON public.profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_scan_month ON public.profiles(scan_month_ref);
CREATE INDEX IF NOT EXISTS idx_exploitations_plan ON public.exploitations(plan);
