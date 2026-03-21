"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import DiagramsClient from "./DiagramsClient";
import LoginForm from "./SignInButton";

type Diagram = {
  id: string; title: string; slug: string;
  diagram_type: string; created_at: string; code: string;
};

export default function DiagramsShell() {
  const [user, setUser] = useState<User | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const allowed = process.env.NEXT_PUBLIC_ALLOWED_EMAIL;

    async function fetchDiagrams(u: User) {
      const { data } = await supabase
        .from("diagrams")
        .select("id, title, slug, diagram_type, created_at, code")
        .eq("user_id", u.id)
        .order("created_at", { ascending: false });
      if (data) setDiagrams(data);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      if (u && allowed && u.email !== allowed) {
        supabase.auth.signOut();
      } else if (u) {
        setUser(u);
        fetchDiagrams(u);
      }
      setSessionChecked(true);
    }).catch(() => { setSessionChecked(true); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      if (u && allowed && u.email !== allowed) {
        supabase.auth.signOut();
        setUser(null);
      } else {
        if (event === "SIGNED_IN") { setUser(u); if (u) fetchDiagrams(u); }
        if (event === "SIGNED_OUT") { setUser(null); setDiagrams([]); }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Hold on dark screen until we know if user is logged in — prevents login flash
  if (!sessionChecked) {
    return <div style={{ position: "fixed", inset: 0, background: "#0f1022" }} />;
  }

  if (!user) {
    return (
      <>
        <div style={{ position: "fixed", inset: 0, background: "#0f1022", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,-apple-system,sans-serif" }}>
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <svg width={64} height={64} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 16 }}>
              <defs><linearGradient id="sbg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#0f051e"/><stop offset="55%" stopColor="#2e0f6b"/><stop offset="100%" stopColor="#0c2340"/></linearGradient></defs>
              <rect width="512" height="512" rx="115" fill="url(#sbg)"/>
              <rect x="48"  y="80" width="130" height="72" rx="16" fill="#fb7185"/>
              <rect x="191" y="80" width="130" height="72" rx="16" fill="#a78bfa"/>
              <rect x="334" y="80" width="130" height="72" rx="16" fill="#34d399"/>
              <line x1="113" y1="152" x2="113" y2="432" stroke="#fb7185" strokeWidth="4" strokeDasharray="20 12" opacity={0.3}/>
              <line x1="256" y1="152" x2="256" y2="432" stroke="#a78bfa" strokeWidth="4" strokeDasharray="20 12" opacity={0.3}/>
              <line x1="399" y1="152" x2="399" y2="432" stroke="#34d399" strokeWidth="4" strokeDasharray="20 12" opacity={0.3}/>
              <line x1="125" y1="210" x2="242" y2="210" stroke="#fbbf24" strokeWidth="14" strokeLinecap="round"/>
              <polygon points="268,210 240,196 240,224" fill="#fbbf24"/>
              <line x1="268" y1="290" x2="385" y2="290" stroke="#38bdf8" strokeWidth="14" strokeLinecap="round"/>
              <polygon points="411,290 383,276 383,304" fill="#38bdf8"/>
              <line x1="125" y1="370" x2="385" y2="370" stroke="#a78bfa" strokeWidth="14" strokeLinecap="round" strokeDasharray="28 14"/>
              <polygon points="99,370 127,356 127,384" fill="#a78bfa"/>
            </svg>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#e8eaf8", margin: 0 }}>Diagrams</h1>
            <p style={{ fontSize: 14, color: "#5a5c7a", margin: 0 }}>Sign in to view your saved diagrams</p>
            <LoginForm />
          </div>
        </div>
      </>
    );
  }

  return <DiagramsClient user={user} diagrams={diagrams} onRefresh={() => {}} />;
}
