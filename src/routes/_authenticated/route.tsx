import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        void navigate({ to: "/auth" });
      } else {
        setChecked(true);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) void navigate({ to: "/auth" });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Verifying session…
        </div>
      </div>
    );
  }

  return <Outlet />;
}
