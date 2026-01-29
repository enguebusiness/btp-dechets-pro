-- Bio-Shield Database Schema
-- Run this migration in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'pro', 'enterprise')),
    verification_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exploitations table
CREATE TABLE IF NOT EXISTS public.exploitations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    siret TEXT,
    adresse TEXT,
    code_postal TEXT,
    ville TEXT,
    telephone TEXT,
    email TEXT,
    num_agrement_bio TEXT,
    organisme_certificateur TEXT,
    date_certification DATE,
    surface_totale DECIMAL(10, 2),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parcelles table
CREATE TABLE IF NOT EXISTS public.parcelles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    exploitation_id UUID REFERENCES public.exploitations ON DELETE CASCADE NOT NULL,
    nom TEXT NOT NULL,
    surface DECIMAL(10, 2) NOT NULL,
    culture_actuelle TEXT,
    type_sol TEXT,
    irrigation BOOLEAN DEFAULT FALSE,
    mode_production TEXT NOT NULL CHECK (mode_production IN ('bio', 'conversion', 'conventionnel')),
    date_debut_conversion DATE,
    coordonnees_gps TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Certificats Fournisseurs table (before intrants for foreign key)
CREATE TABLE IF NOT EXISTS public.certificats_fournisseurs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    exploitation_id UUID REFERENCES public.exploitations ON DELETE CASCADE NOT NULL,
    fournisseur_nom TEXT NOT NULL,
    numero_certificat TEXT NOT NULL,
    organisme_certificateur TEXT NOT NULL,
    date_emission DATE NOT NULL,
    date_expiration DATE NOT NULL,
    produits_couverts TEXT[] DEFAULT '{}',
    document_url TEXT,
    statut TEXT NOT NULL CHECK (statut IN ('valide', 'expire', 'a_renouveler')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Intrants table
CREATE TABLE IF NOT EXISTS public.intrants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    exploitation_id UUID REFERENCES public.exploitations ON DELETE CASCADE NOT NULL,
    parcelle_id UUID REFERENCES public.parcelles ON DELETE SET NULL,
    document_id UUID,
    produit_nom TEXT NOT NULL,
    fournisseur TEXT,
    lot_number TEXT,
    quantite DECIMAL(12, 2) NOT NULL,
    unite TEXT NOT NULL,
    date_achat DATE NOT NULL,
    date_utilisation DATE,
    prix_unitaire DECIMAL(10, 2),
    prix_total DECIMAL(10, 2),
    est_bio BOOLEAN DEFAULT FALSE,
    numero_certificat TEXT,
    type_intrant TEXT NOT NULL CHECK (type_intrant IN ('semence', 'engrais', 'phytosanitaire', 'amendement', 'autre')),
    conformite_status TEXT CHECK (conformite_status IN ('conforme', 'attention', 'non_conforme')),
    conformite_details TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recoltes table
CREATE TABLE IF NOT EXISTS public.recoltes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    exploitation_id UUID REFERENCES public.exploitations ON DELETE CASCADE NOT NULL,
    parcelle_id UUID REFERENCES public.parcelles ON DELETE SET NULL NOT NULL,
    culture TEXT NOT NULL,
    variete TEXT,
    date_recolte DATE NOT NULL,
    quantite DECIMAL(12, 2) NOT NULL,
    unite TEXT NOT NULL,
    rendement DECIMAL(10, 2),
    qualite TEXT,
    destination TEXT,
    prix_vente DECIMAL(10, 2),
    acheteur TEXT,
    numero_lot_sortie TEXT,
    certifie_bio BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents Storage table
CREATE TABLE IF NOT EXISTS public.documents_storage (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    exploitation_id UUID REFERENCES public.exploitations ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    nom_fichier TEXT NOT NULL,
    type_doc TEXT NOT NULL CHECK (type_doc IN ('facture', 'certificat', 'bon_livraison', 'analyse', 'autre')),
    storage_path TEXT NOT NULL,
    taille BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    ocr_processed BOOLEAN DEFAULT FALSE,
    ocr_data JSONB,
    ocr_validated BOOLEAN DEFAULT FALSE,
    validation_date TIMESTAMPTZ,
    intrants_extraits JSONB DEFAULT '[]',
    conservation_jusqu_a DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '5 years'),
    certificat_fournisseur_id UUID REFERENCES public.certificats_fournisseurs ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_exploitations_owner_id ON public.exploitations(owner_id);
CREATE INDEX IF NOT EXISTS idx_parcelles_exploitation_id ON public.parcelles(exploitation_id);
CREATE INDEX IF NOT EXISTS idx_intrants_exploitation_id ON public.intrants(exploitation_id);
CREATE INDEX IF NOT EXISTS idx_intrants_date_achat ON public.intrants(date_achat);
CREATE INDEX IF NOT EXISTS idx_intrants_conformite_status ON public.intrants(conformite_status);
CREATE INDEX IF NOT EXISTS idx_recoltes_exploitation_id ON public.recoltes(exploitation_id);
CREATE INDEX IF NOT EXISTS idx_recoltes_date_recolte ON public.recoltes(date_recolte);
CREATE INDEX IF NOT EXISTS idx_certificats_exploitation_id ON public.certificats_fournisseurs(exploitation_id);
CREATE INDEX IF NOT EXISTS idx_certificats_date_expiration ON public.certificats_fournisseurs(date_expiration);
CREATE INDEX IF NOT EXISTS idx_certificats_fournisseur_nom ON public.certificats_fournisseurs(fournisseur_nom);
CREATE INDEX IF NOT EXISTS idx_documents_exploitation_id ON public.documents_storage(exploitation_id);
CREATE INDEX IF NOT EXISTS idx_documents_conservation ON public.documents_storage(conservation_jusqu_a);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exploitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recoltes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificats_fournisseurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents_storage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for exploitations
CREATE POLICY "Users can view own exploitations" ON public.exploitations
    FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own exploitations" ON public.exploitations
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own exploitations" ON public.exploitations
    FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own exploitations" ON public.exploitations
    FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for parcelles (through exploitation)
CREATE POLICY "Users can view parcelles of own exploitations" ON public.parcelles
    FOR SELECT USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can insert parcelles to own exploitations" ON public.parcelles
    FOR INSERT WITH CHECK (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can update parcelles of own exploitations" ON public.parcelles
    FOR UPDATE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can delete parcelles of own exploitations" ON public.parcelles
    FOR DELETE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

-- RLS Policies for intrants
CREATE POLICY "Users can view intrants of own exploitations" ON public.intrants
    FOR SELECT USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can insert intrants to own exploitations" ON public.intrants
    FOR INSERT WITH CHECK (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can update intrants of own exploitations" ON public.intrants
    FOR UPDATE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can delete intrants of own exploitations" ON public.intrants
    FOR DELETE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

-- RLS Policies for recoltes
CREATE POLICY "Users can view recoltes of own exploitations" ON public.recoltes
    FOR SELECT USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can insert recoltes to own exploitations" ON public.recoltes
    FOR INSERT WITH CHECK (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can update recoltes of own exploitations" ON public.recoltes
    FOR UPDATE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can delete recoltes of own exploitations" ON public.recoltes
    FOR DELETE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

-- RLS Policies for certificats_fournisseurs
CREATE POLICY "Users can view certificats of own exploitations" ON public.certificats_fournisseurs
    FOR SELECT USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can insert certificats to own exploitations" ON public.certificats_fournisseurs
    FOR INSERT WITH CHECK (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can update certificats of own exploitations" ON public.certificats_fournisseurs
    FOR UPDATE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can delete certificats of own exploitations" ON public.certificats_fournisseurs
    FOR DELETE USING (
        exploitation_id IN (SELECT id FROM public.exploitations WHERE owner_id = auth.uid())
    );

-- RLS Policies for documents_storage
CREATE POLICY "Users can view own documents" ON public.documents_storage
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents" ON public.documents_storage
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON public.documents_storage
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON public.documents_storage
    FOR DELETE USING (auth.uid() = user_id);

-- Create storage bucket for documents (run in Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Storage policies (run in Supabase dashboard)
-- CREATE POLICY "Users can upload documents" ON storage.objects
--     FOR INSERT WITH CHECK (
--         bucket_id = 'documents' AND
--         auth.uid()::text = (storage.foldername(name))[1]
--     );

-- CREATE POLICY "Users can view own documents" ON storage.objects
--     FOR SELECT USING (
--         bucket_id = 'documents' AND
--         auth.uid()::text = (storage.foldername(name))[1]
--     );

-- CREATE POLICY "Users can delete own documents" ON storage.objects
--     FOR DELETE USING (
--         bucket_id = 'documents' AND
--         auth.uid()::text = (storage.foldername(name))[1]
--     );

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exploitations_updated_at
    BEFORE UPDATE ON public.exploitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parcelles_updated_at
    BEFORE UPDATE ON public.parcelles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intrants_updated_at
    BEFORE UPDATE ON public.intrants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recoltes_updated_at
    BEFORE UPDATE ON public.recoltes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_certificats_updated_at
    BEFORE UPDATE ON public.certificats_fournisseurs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents_storage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, subscription_status, verification_count)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        'free',
        0
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update certificate status based on expiration
CREATE OR REPLACE FUNCTION update_certificate_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.date_expiration < CURRENT_DATE THEN
        NEW.statut = 'expire';
    ELSIF NEW.date_expiration < CURRENT_DATE + INTERVAL '30 days' THEN
        NEW.statut = 'a_renouveler';
    ELSE
        NEW.statut = 'valide';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_certificate_expiration
    BEFORE INSERT OR UPDATE ON public.certificats_fournisseurs
    FOR EACH ROW EXECUTE FUNCTION update_certificate_status();
