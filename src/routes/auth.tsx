import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyRole } from "@/lib/admin.functions";
import emblem from "@/assets/reference-emblem.webp.asset.json";
import wordmark from "@/assets/reference-wordmark.webp.asset.json";
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
    <div className="flex min-h-screen items-center justify-center px-4 font-sans text-foreground">
      <div className="glass relative w-full max-w-sm border border-line/50 p-8 shadow-[5px_6px_0_#a4774b33]">
        <div className="flex items-center gap-3">
          <img
            src={emblem.url}
            alt="BIZZNNOVATE emblem"
            className="size-12 object-contain"
          />
          <div>
            <img src={wordmark.url} alt="BIZZNNOVATE" className="w-44 object-contain" />
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Admin Console</div>
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
