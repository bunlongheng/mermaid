import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const AI_SECRET = process.env.AI_API_SECRET;

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
}

/**
 * POST /api/ai/diagrams
 *
 * Creates a diagram on behalf of the owner with:
 *   - is_favorite = true
 *   - boxOverlay  = "gloss"
 *   - iconMode    = "icons"
 *
 * Headers:
 *   Authorization: Bearer <AI_API_SECRET>
 *
 * Body (JSON):
 *   {
 *     "title":       "My Diagram",          // required
 *     "code":        "sequenceDiagram\n…",  // required
 *     "diagramType": "sequence"             // optional, defaults to "sequence"
 *   }
 *
 * Response 201:
 *   { "id": "…", "url": "https://diagrams-bheng.vercel.app/?id=…", … }
 */
export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!AI_SECRET) {
    return NextResponse.json({ error: "AI_API_SECRET not configured" }, { status: 500 });
  }
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (bearer !== AI_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  let body: { title?: string; code?: string; diagramType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({
      error: "Invalid JSON body",
      fix: "Send Content-Type: application/json with a valid JSON body",
      example: { title: "My Diagram", code: "sequenceDiagram\n  A->>B: hello", diagramType: "sequence" },
    }, { status: 400 });
  }

  const { title, code, diagramType = "sequence" } = body;
  if (!title?.trim()) return NextResponse.json({
    error: "title is required",
    fix: "Add a non-empty \"title\" field to your JSON body",
    example: { title: "My Diagram", code: "sequenceDiagram\n  A->>B: hello", diagramType: "sequence" },
  }, { status: 400 });
  if (!code?.trim()) return NextResponse.json({
    error: "code is required",
    fix: "Add a non-empty \"code\" field containing valid mermaid syntax",
    example: { title: "My Diagram", code: "sequenceDiagram\n  A->>B: hello", diagramType: "sequence" },
  }, { status: 400 });

  // ── Resolve owner user_id from ALLOWED_EMAIL ──────────────────────────────
  const ownerEmail = process.env.ALLOWED_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json({ error: "ALLOWED_EMAIL not configured" }, { status: 500 });
  }
  const admin = createAdminClient();
  const { data: users, error: userErr } = await admin.auth.admin.listUsers();
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
  const owner = users.users.find(u => u.email === ownerEmail);
  if (!owner) return NextResponse.json({ error: "Owner not found" }, { status: 500 });

  // ── Unique slug ───────────────────────────────────────────────────────────
  const baseSlug = toSlug(title);
  let slug = baseSlug;
  let counter = 2;
  while (true) {
    const { data } = await admin.from("diagrams").select("id").eq("user_id", owner.id).eq("slug", slug).limit(1);
    if (!data || data.length === 0) break;
    slug = `${baseSlug}-${counter++}`;
  }

  // ── Insert ────────────────────────────────────────────────────────────────
  const settings = {
    opts: {
      boxOverlay: "gloss",
      iconMode: "icons",
    },
  };

  const { data: diagram, error } = await admin
    .from("diagrams")
    .insert({
      user_id: owner.id,
      title: title.trim(),
      slug,
      code: code.trim(),
      diagram_type: diagramType,
      is_favorite: true,
      tags: ["API"],
      settings,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://diagrams-bheng.vercel.app";
  return NextResponse.json(
    { ...diagram, url: `${baseUrl}/?id=${diagram.id}` },
    { status: 201 },
  );
}
