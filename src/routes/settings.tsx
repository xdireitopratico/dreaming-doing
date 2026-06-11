import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "@/lib/toast";
import { ArrowLeft, Key, Plug, User, Mail, Lock, LogOut } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/settings")({
  component: () => (
    <DashboardShell requireAuth activeNav="settings">
      <SettingsPage />
    </DashboardShell>
  ),
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, github_username, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const name =
      profile?.display_name ??
      (user?.user_metadata?.full_name as string | undefined) ??
      (user?.user_metadata?.name as string | undefined) ??
      "";
    setDisplayName(name);
  }, [profile, user]);

  const handleSaveProfile = useCallback(async () => {
    if (!user?.id) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: displayName.trim() || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["profile", user.id] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar perfil");
    } finally {
      setSavingProfile(false);
    }
  }, [displayName, qc, user?.id]);

  const handlePasswordChange = useCallback(async () => {
    if (newPassword.length < 8) {
      toast.error("Senha deve ter pelo menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao alterar senha");
    } finally {
      setSavingPassword(false);
    }
  }, [confirmPassword, newPassword]);

  return (
    <div className="px-6 py-8 max-w-[800px] mx-auto pb-16">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-ghost)] hover:text-[var(--foreground)] mb-6"
      >
        <ArrowLeft className="size-3" />
        PROJETOS
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-3xl tracking-tight">Ajustes</h1>
        <p className="font-mono text-[10px] text-[var(--text-dim)] mt-1">
          Conta e atalhos. Chaves de API, sandbox E2B e modelos ficam em API e Modelos.
        </p>
      </motion.div>

      <section className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/40 p-5">
        <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
          <User className="size-3.5 text-[var(--primary)]" />
          Perfil
        </h2>
        <div className="space-y-4 max-w-md">
          <div>
            <Label className="font-mono text-[10px] text-[var(--text-dim)]">Nome exibido</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Seu nome"
              className="mt-1.5 bg-[var(--surface-2)] border-[var(--border)] font-mono text-sm"
            />
          </div>
          {profile?.github_username && (
            <p className="font-mono text-[9px] text-[var(--text-ghost)]">
              GitHub: @{profile.github_username}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            className="bg-[var(--primary)] text-[#0a0a0a]"
            disabled={savingProfile}
            onClick={() => void handleSaveProfile()}
          >
            {savingProfile ? "Salvando…" : "Salvar perfil"}
          </Button>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/40 p-5">
        <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
          <Mail className="size-3.5 text-[var(--primary)]" />
          Conta
        </h2>
        <div className="space-y-3 max-w-md">
          <div>
            <Label className="font-mono text-[10px] text-[var(--text-dim)]">Email</Label>
            <Input
              value={user?.email ?? ""}
              readOnly
              className="mt-1.5 bg-[var(--surface-2)]/50 border-[var(--border)] font-mono text-sm opacity-80"
            />
            <p className="font-mono text-[8px] text-[var(--text-ghost)] mt-1.5">
              Para trocar o email, use o fluxo de reautenticação do Supabase Auth (em breve na UI).
            </p>
          </div>
          <div>
            <Label className="font-mono text-[10px] text-[var(--text-dim)]">ID</Label>
            <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 break-all">
              {user?.id}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/40 p-5">
        <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
          <Lock className="size-3.5 text-[var(--primary)]" />
          Senha
        </h2>
        <div className="space-y-4 max-w-md">
          <div>
            <Label className="font-mono text-[10px] text-[var(--text-dim)]">Nova senha</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1.5 bg-[var(--surface-2)] border-[var(--border)] font-mono text-sm"
            />
          </div>
          <div>
            <Label className="font-mono text-[10px] text-[var(--text-dim)]">Confirmar senha</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1.5 bg-[var(--surface-2)] border-[var(--border)] font-mono text-sm"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savingPassword || !newPassword}
            onClick={() => void handlePasswordChange()}
          >
            {savingPassword ? "Alterando…" : "Alterar senha"}
          </Button>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/40 p-5">
        <h2 className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
          Integrações
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/api"
            className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-4 hover:bg-[var(--surface-2)] transition-colors"
          >
            <Key className="size-5 text-[var(--primary)] shrink-0" />
            <div>
              <div className="font-mono text-[11px]">API Keys</div>
              <div className="font-mono text-[9px] text-[var(--text-ghost)]">
                IA, pool ROBIN, E2B e voz
              </div>
            </div>
          </Link>
          <Link
            to="/connectors"
            className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-4 hover:bg-[var(--surface-2)] transition-colors"
          >
            <Plug className="size-5 text-[var(--primary)] shrink-0" />
            <div>
              <div className="font-mono text-[11px]">Conectores</div>
              <div className="font-mono text-[9px] text-[var(--text-ghost)]">
                GitHub, Vercel, Supabase, Cloudflare
              </div>
            </div>
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] text-[var(--foreground)]">Sessão</p>
          <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-0.5">
            Encerrar login neste dispositivo
          </p>
        </div>
        <Button variant="outline" onClick={() => void signOut()} className="font-mono text-[11px]">
          <LogOut className="size-3.5 mr-2" />
          Sair
        </Button>
      </section>
    </div>
  );
}
