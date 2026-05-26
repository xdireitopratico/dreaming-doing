
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.connector_kind AS ENUM ('github','vercel','cloudflare','anthropic','openai');
CREATE TYPE public.message_role AS ENUM ('user','assistant','system','tool');
CREATE TYPE public.deploy_provider AS ENUM ('vercel','cloudflare','netlify');
CREATE TYPE public.deploy_status AS ENUM ('queued','building','ready','error','cancelled');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  github_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL DEFAULT 'vite-react',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_select_own" ON public.projects FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "projects_insert_own" ON public.projects FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects_update_own" ON public.projects FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "projects_delete_own" ON public.projects FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ============ PROJECT FILES ============
CREATE TABLE public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  content_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, path)
);
CREATE INDEX project_files_project_idx ON public.project_files(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO authenticated;
GRANT ALL ON public.project_files TO service_role;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "files_select_own" ON public.project_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "files_insert_own" ON public.project_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "files_update_own" ON public.project_files FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "files_delete_own" ON public.project_files FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- ============ SNAPSHOTS ============
CREATE TABLE public.project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label TEXT,
  tree JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_snapshots_project_idx ON public.project_snapshots(project_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.project_snapshots TO authenticated;
GRANT ALL ON public.project_snapshots TO service_role;
ALTER TABLE public.project_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots_select_own" ON public.project_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "snapshots_insert_own" ON public.project_snapshots FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "snapshots_delete_own" ON public.project_snapshots FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- ============ CONVERSATIONS ============
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX conversations_project_idx ON public.conversations(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_select_own" ON public.conversations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "conv_insert_own" ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "conv_update_own" ON public.conversations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "conv_delete_own" ON public.conversations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- ============ MESSAGES ============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role public.message_role NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_idx ON public.messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_select_own" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = conversation_id AND p.owner_id = auth.uid()));
CREATE POLICY "msg_insert_own" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = conversation_id AND p.owner_id = auth.uid()));
CREATE POLICY "msg_update_own" ON public.messages FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = conversation_id AND p.owner_id = auth.uid()));
CREATE POLICY "msg_delete_own" ON public.messages FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = conversation_id AND p.owner_id = auth.uid()));

-- ============ CONNECTORS (tokens cifrados; SELECT proibido para usuários) ============
CREATE TABLE public.connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.connector_kind NOT NULL,
  token_encrypted TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, kind)
);
GRANT ALL ON public.connectors TO service_role;
-- nenhum grant para authenticated: leitura/escrita só via edge functions
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "connectors_none" ON public.connectors FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- View pública (sem token) — usuário consulta esta
CREATE VIEW public.connectors_public WITH (security_invoker = true) AS
  SELECT id, owner_id, kind, meta, created_at, updated_at
  FROM public.connectors;
GRANT SELECT ON public.connectors_public TO authenticated;
-- Para que a view filtre por usuário precisamos de policy SELECT específica em connectors
CREATE POLICY "connectors_view_meta" ON public.connectors FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- ============ MCP SERVERS ============
CREATE TABLE public.mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'http',
  auth_state TEXT NOT NULL DEFAULT 'none',
  tokens_encrypted TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_servers TO authenticated;
GRANT ALL ON public.mcp_servers TO service_role;
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mcp_select_own" ON public.mcp_servers FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "mcp_insert_own" ON public.mcp_servers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "mcp_update_own" ON public.mcp_servers FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "mcp_delete_own" ON public.mcp_servers FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ============ DEPLOYMENTS ============
CREATE TABLE public.deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider public.deploy_provider NOT NULL,
  url TEXT,
  status public.deploy_status NOT NULL DEFAULT 'queued',
  logs TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.deployments TO authenticated;
GRANT ALL ON public.deployments TO service_role;
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deploy_select_own" ON public.deployments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "deploy_insert_own" ON public.deployments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- ============ TRIGGER: auto-cria profile ao registrar ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ TRIGGER: updated_at ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER files_touch BEFORE UPDATE ON public.project_files FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER connectors_touch BEFORE UPDATE ON public.connectors FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER deployments_touch BEFORE UPDATE ON public.deployments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_files;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.project_files REPLICA IDENTITY FULL;
