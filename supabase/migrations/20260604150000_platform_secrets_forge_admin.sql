-- Secrets globais do projeto (admin FORGE) — valores só via service_role / edge functions.

CREATE TABLE IF NOT EXISTS public.platform_secrets (
  name TEXT PRIMARY KEY,
  value_encrypted TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '••••',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.platform_secrets IS
  'Secrets globais FORGE. Sem RLS para authenticated — leitura/escrita só edge + service_role.';

ALTER TABLE public.platform_secrets ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy para authenticated = acesso negado direto à tabela.

GRANT ALL ON public.platform_secrets TO service_role;

-- Admin exclusivo por email (complementa user_roles)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = lower('xdireitopratico@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;