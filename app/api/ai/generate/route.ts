import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createAdminClient } from "@/lib/supabase/server";

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

const SYSTEM = `You are an expert Mermaid sequence diagram generator.

Given a user prompt, return ONLY a valid JSON object — no markdown, no explanation — with:
{
  "title": "<concise diagram title>",
  "code": "<full mermaid sequenceDiagram code>",
  "diagramType": "sequence"
}

Rules for the code field:
- Always start with: ---\\ntitle: <title>\\n---\\nsequenceDiagram
- Use participant aliases with emoji icons, e.g.: participant U as 🧑 User
- Use ->> for requests, -->> for responses
- Max 20 messages, keep it clear and readable
- No markdown code fences in the code value
- Escape all newlines as \\n in the JSON string`;

export async function POST(req: NextRequest) {
  // ── Auth: session cookie only (UI-facing route) ───────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { prompt?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { prompt } = body;
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  // ── Call Claude ───────────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let title: string, code: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.find(b => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);
    title = parsed.title;
    code  = parsed.code;
    if (!title || !code) throw new Error("Missing title or code");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Claude generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Save to DB ────────────────────────────────────────────────────────────
  const ownerEmail = process.env.ALLOWED_EMAIL;
  if (!ownerEmail) return NextResponse.json({ error: "ALLOWED_EMAIL not configured" }, { status: 500 });
  const admin = createAdminClient();
  const { data: users } = await admin.auth.admin.listUsers();
  const owner = users?.users.find(u => u.email === ownerEmail);
  if (!owner) return NextResponse.json({ error: "Owner not found" }, { status: 500 });

  const baseSlug = toSlug(title);
  let slug = baseSlug, counter = 2;
  while (true) {
    const { data } = await admin.from("diagrams").select("id").eq("user_id", owner.id).eq("slug", slug).limit(1);
    if (!data || data.length === 0) break;
    slug = `${baseSlug}-${counter++}`;
  }

  const { data: diagram, error } = await admin
    .from("diagrams")
    .insert({
      user_id: owner.id,
      title: title.trim(),
      slug,
      code: code.trim(),
      diagram_type: "sequence",
      tags: ["AI"],
      settings: { opts: { boxOverlay: "gloss", iconMode: "icons" } },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://diagrams-bheng.vercel.app";
  return NextResponse.json({ ...diagram, url: `${baseUrl}/?id=${diagram.id}` }, { status: 201 });
}
