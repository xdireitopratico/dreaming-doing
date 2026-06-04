import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/MarketingShell";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
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
      toast.error("Supabase não configurado neste ambiente.");
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
      toast.error("Supabase não configurado neste ambiente.");
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
    else toast.success("Conta criada. Verifique seu email para confirmar.");
  };

  const google = async () => {
    if (!isSupabaseConfigured()) {
      toast.error("Supabase não configurado neste ambiente.");
      return;
    }

    setBusy(true);
    const redirectTo = `${window.location.origin}${redirectTarget}`;

    if (isLovableEnvironment()) {
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectTo,
      });
      if (res.error) {
        toast.error(res.error.message || "Falha no login com Google");
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

  return (
    <div className="min-h-screen flex flex-col">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-hero)" }}
        aria-hidden
      />

      <header className="relative z-10 h-14 px-6 flex items-center justify-between max-w-[1120px] w-full mx-auto">
        <Link to="/" className="flex items-center gap-2">
          <Logo size={16} />
          <span className="font-display text-lg">FORGE</span>
        </Link>
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="size-3.5" /> Voltar
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl md:text-5xl leading-tight">
              Bem-vindo de volta.
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              Entre para retomar onde parou.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface/80 backdrop-blur p-6 shadow-[var(--shadow-soft)] space-y-5">
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>
              {(["signin", "signup"] as const).map((mode) => (
                <TabsContent value={mode} key={mode} className="space-y-4 mt-5">
                  <div className="space-y-2">
                    <Label
                      htmlFor={`auth-email-${mode}`}
                      className="text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      Email
                    </Label>
                    <Input
                      id={`auth-email-${mode}`}
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor={`auth-password-${mode}`}
                      className="text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      Senha
                    </Label>
                    <Input
                      id={`auth-password-${mode}`}
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={busy || !email || !password}
                    onClick={mode === "signin" ? signIn : signUp}
                  >
                    {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
                    {mode === "signin" ? "Entrar" : "Criar conta"}
                  </Button>
                </TabsContent>
              ))}
            </Tabs>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                <span className="bg-surface px-3 text-muted-foreground">ou</span>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={google} disabled={busy}>
              <svg className="size-4 mr-2" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.4-1.62 4.1-5.27 4.1-3.17 0-5.76-2.63-5.76-5.87s2.59-5.87 5.76-5.87c1.81 0 3.02.77 3.71 1.43L18.3 5.5C16.66 4.05 14.55 3.2 12.18 3.2c-4.92 0-8.93 4-8.93 8.93s4.01 8.93 8.93 8.93c5.16 0 8.58-3.62 8.58-8.72 0-.59-.06-1.04-.41-1.24z"
                />
              </svg>
              Continuar com Google
            </Button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-6">
            Ao continuar você concorda com termos básicos da beta — código seu, dados seus.
          </p>
        </div>
      </main>
    </div>
  );
}