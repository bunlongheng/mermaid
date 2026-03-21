"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/app/CuteToast";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", fontSize: 14, borderRadius: 8,
    border: "1px solid #2a2b45", background: "#0f1022", color: "#e8eaf8",
    outline: "none", boxSizing: "border-box",
    fontFamily: "system-ui,-apple-system,sans-serif",
  };

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    const meta = data.user?.user_metadata;
    const rawName = meta?.full_name || meta?.name || data.user?.email || "";
    const firstName = rawName.includes("@")
      ? (rawName.split("@")[0].split(/[._+]/)[0] || "you").replace(/^./, (c: string) => c.toUpperCase())
      : rawName.split(" ")[0];
    const greetings = [
      "Let's build something cool.",
      "Welcome back, boss.",
      "Let's do it. One diagram at a time.",
      "Good to see you.",
      "Ready when you are.",
      "Let's make it count.",
      "Diagrams standing by.",
      "Ready, set, go.",
      "All systems initiated.",
      "Let's make something great.",
    ];
    showToast(greetings[Math.floor(Math.random() * greetings.length)]);
  }

  async function sendReset() {
    if (!email) { setError("Enter your email first"); return; }
    setError(""); setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setResetSent(true);
  }

  return (
    <form onSubmit={signIn} style={{ display: "flex", flexDirection: "column", gap: 10, width: 280 }}>
      <input
        type="email" placeholder="Email" value={email} required autoComplete="email"
        onChange={e => setEmail(e.target.value)} style={inputStyle}
      />
      <input
        type="password" placeholder="Password" value={password} required autoComplete="current-password"
        onChange={e => setPassword(e.target.value)} style={inputStyle}
      />
      {error && <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{error}</p>}
      <button type="submit" disabled={loading} style={{
        padding: "10px 0", fontSize: 14, fontWeight: 600, borderRadius: 8,
        background: "#7c3aed", color: "white", border: "none", cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
      }}>
        {loading ? "Signing in…" : "Sign In"}
      </button>
      {resetSent
        ? <p style={{ fontSize: 12, color: "#6ee7b7", margin: 0, textAlign: "center" }}>Check your email for a reset link</p>
        : <button type="button" onClick={sendReset} style={{
            fontSize: 12, color: "#6b7280", background: "none", border: "none",
            cursor: "pointer", padding: 0, textAlign: "center",
          }}>Forgot password?</button>
      }
    </form>
  );
}
