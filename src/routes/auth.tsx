import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyRole } from "@/lib/admin.functions";
import bizznnovateLogo from "@/assets/bizznnovate-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin Sign In — BIZZNNOVATE" },
      { name: "description", content: "Judge and admin sign-in for the BIZZNNOVATE live leaderboard." },
      { property: "og:title", content: "Admin Sign In — BIZZNNOVATE" },
      { property: "og:description", content: "Judge and admin sign-in for the BIZZNNOVATE live leaderboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { role } = await getMyRole();
      if (!role) {
        toast.error("Your account has no admin role yet. Ask the super admin to grant access.");
      }
      void navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 font-sans text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-gold/10 blur-[130px]" />
      </div>
      <div className="glass relative w-full max-w-sm rounded-xl p-8 ring-1 ring-line">
        <div>
          <img
            src={bizznnovateLogo.url}
            alt="BIZZNNOVATE"
            className="h-auto w-48 object-contain object-left"
          />
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Admin Console
          </div>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-line bg-ink-3/60 font-mono text-sm"
              placeholder="judge@iips.edu"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-line bg-ink-3/60 font-mono text-sm"
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-primary font-mono text-xs font-semibold uppercase tracking-[0.15em] text-primary-foreground hover:bg-primary/90">
            {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        <p className="mt-4 text-center font-mono text-[10px] text-muted-foreground/70">
          The first account to sign in becomes the super admin.
        </p>
      </div>
    </div>
  );
}
