import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "@/lib/toast";
import { sanitizeNext } from "@/lib/sanitize-next";
import { navigateAfterAuth } from "@/lib/navigate-after-auth";
import { isLovableEnvironment } from "@/lib/is-lovable";

type Search = { next?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" ? sanitizeNext(s.next) : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const redirectTarget = sanitizeNext(next);

  useEffect(() => {
    if (!loading && user) navigateAfterAuth(navigate, redirectTarget);
  }, [user, loading, navigate, redirectTarget]);

  const signIn = async () => {
    if (!isSupabaseConfigured()) {
      toast.error("Serviço temporariamente indisponível. Tente novamente em instantes.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else navigateAfterAuth(navigate, redirectTarget);
  };

  const signUp = async () => {
    if (!isSupabaseConfigured()) {
      toast.error("Serviço temporariamente indisponível. Tente novamente em instantes.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${redirectTarget}`,
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  const google = async () => {
    if (!isSupabaseConfigured()) {
      toast.error("Serviço temporariamente indisponível. Tente novamente em instantes.");
      return;
    }

    setBusy(true);
    const redirectTo = `${window.location.origin}${redirectTarget}`;

    if (isLovableEnvironment()) {
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectTo,
      });
      if (res.error) {
        toast.error(res.error.message || "Não foi possível entrar com Google");
        setBusy(false);
      }
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  if (loading) {
    return (
      <div className="auth-workspace grid place-items-center" style={{ gridTemplateColumns: "1fr" }}>
        <Loader2 className="size-6 animate-spin text-[var(--forge-primary)]" />
      </div>
    );
  }

  return (
    <div className="auth-workspace">
      <section className="auth-visual" aria-hidden={false}>
        <div className="auth-visual-top">
          <ForgeLogoMark linkTo="/" size={22} />
          <Link
            to="/"
            className="auth-visual-back inline-flex items-center gap-1 text-xs text-[var(--forge-muted)] hover:text-[var(--forge-text)]"
          >
            <ArrowLeft className="size-3.5" />
            Início
          </Link>
        </div>

        <div className="auth-visual-body">
          <div className="auth-visual-eyebrow">FORGE · beta</div>
          <h2 className="auth-visual-title">Make Your Dream.</h2>
          <p className="auth-visual-sub">
            Construa apps web com IA: descreva a ideia, veja o preview ao vivo e publique quando estiver
            pronto — com a infraestrutura FORGE ou com as suas próprias contas.
          </p>
        </div>

        <p className="auth-visual-footer">Seu código · seus dados · sua escolha de stack</p>
      </section>

      <main className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-panel-heading">
            <h1>Crie sua conta FORGE</h1>
            <p>Entre para retomar projetos ou cadastre-se em menos de um minuto.</p>
          </div>

          <div className="auth-card">
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="auth-tabs-list h-auto bg-transparent p-0 border-0">
                <TabsTrigger value="signin" className="auth-tabs-trigger border-0 shadow-none">
                  Entrar
                </TabsTrigger>
                <TabsTrigger value="signup" className="auth-tabs-trigger border-0 shadow-none">
                  Cadastrar
                </TabsTrigger>
              </TabsList>

              {(["signin", "signup"] as const).map((mode) => (
                <TabsContent value={mode} key={mode} className="space-y-4 mt-5">
                  <div className="auth-field space-y-0">
                    <Label htmlFor={`auth-email-${mode}`}>Email</Label>
                    <Input
                      id={`auth-email-${mode}`}
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="auth-field space-y-0">
                    <Label htmlFor={`auth-password-${mode}`}>Senha</Label>
                    <Input
                      id={`auth-password-${mode}`}
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <Button
                    className="auth-btn-primary"
                    disabled={busy || !email || !password}
                    onClick={mode === "signin" ? signIn : signUp}
                  >
                    {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
                    {mode === "signin" ? "Entrar" : "Criar conta"}
                  </Button>
                </TabsContent>
              ))}
            </Tabs>

            <div className="auth-divider">
              <span>ou</span>
            </div>

            <Button variant="outline" className="auth-btn-google" onClick={google} disabled={busy}>
              <svg className="size-4 mr-2" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.4-1.62 4.1-5.27 4.1-3.17 0-5.76-2.63-5.76-5.87s2.59-5.87 5.76-5.87c1.81 0 3.02.77 3.71 1.43L18.3 5.5C16.66 4.05 14.55 3.2 12.18 3.2c-4.92 0-8.93 4-8.93 8.93s4.01 8.93 8.93 8.93c5.16 0 8.58-3.62 8.58-8.72 0-.59-.06-1.04-.41-1.24z"
                />
              </svg>
              Continuar com Google
            </Button>
          </div>

          <p className="auth-legal">
            Ao continuar, você aceita os termos da versão beta. Seus projetos e credenciais próprias
            permanecem sob seu controle.
          </p>
        </div>
      </main>
    </div>
  );
}