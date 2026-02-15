-- =============================================
-- Propósito AML — Supabase Migration
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================

-- Tabela de usuários (extensão do auth.users)
CREATE TABLE IF NOT EXISTS aml_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de créditos (1 registro por usuário)
CREATE TABLE IF NOT EXISTS aml_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de pagamentos (histórico)
CREATE TABLE IF NOT EXISTS aml_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tx_hash TEXT UNIQUE,
  usdt_amount DECIMAL(12,4) DEFAULT 0,
  credits_granted INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de relatórios AML
CREATE TABLE IF NOT EXISTS aml_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_id TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  chain TEXT NOT NULL DEFAULT '',
  risk_level TEXT DEFAULT 'UNKNOWN',
  risk_score INTEGER DEFAULT 0,
  data_json JSONB,
  report_hash TEXT,
  blockchain_cert TEXT,
  blockchain_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_aml_reports_user ON aml_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_aml_reports_rid ON aml_reports(report_id);
CREATE INDEX IF NOT EXISTS idx_aml_payments_user ON aml_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_aml_payments_tx ON aml_payments(tx_hash);

-- RLS (Row Level Security) — habilitar para segurança
ALTER TABLE aml_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE aml_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE aml_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE aml_reports ENABLE ROW LEVEL SECURITY;

-- Policies: service role tem acesso total (usado pelo backend)
-- Usuários autenticados só veem seus próprios dados
CREATE POLICY "Users see own data" ON aml_users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users see own credits" ON aml_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users see own payments" ON aml_payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users see own reports" ON aml_reports FOR SELECT USING (auth.uid() = user_id);

-- Service role bypass (backend APIs)
CREATE POLICY "Service full access users" ON aml_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service full access credits" ON aml_credits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service full access payments" ON aml_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service full access reports" ON aml_reports FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- PRONTO! Tabelas criadas.
-- Configure as variáveis de ambiente no Vercel:
--   SUPABASE_URL=https://xxx.supabase.co
--   SUPABASE_SERVICE_KEY=eyJ...  (service role key)
--   SUPABASE_ANON_KEY=eyJ...    (anon key)
-- =============================================
