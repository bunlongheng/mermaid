"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Code2, SlidersHorizontal, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Participant { id: string; label: string; color: string }
type Arrow = "solid" | "dashed";
interface SeqMsg { from: string; to: string; text: string; arrow: Arrow; step: number; displayStep?: number }
interface Diagram { participants: Participant[]; messages: SeqMsg[]; title?: string }
interface Opts { coloredLines: boolean; coloredNumbers: boolean; coloredText: boolean; font: string; lifelineDash: string; theme: string; showIcons: boolean; icons: Record<string,string>; showBigNumbers: boolean }
interface Layout { stepHeight: number; boxWidth: number; spacing: number; textSize: number; margin: number }

const DEFAULT_OPTS: Opts = { coloredLines: true, coloredNumbers: true, coloredText: true, font: "Inter", lifelineDash: "long", theme: "light", showIcons: false, icons: {}, showBigNumbers: false };
const DEFAULT_LAYOUT: Layout = { stepHeight: 42, boxWidth: 141, spacing: 250, textSize: 13, margin: 120 };

// ── Palette ───────────────────────────────────────────────────────────────────
const PAL = ["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#f43f5e","#84cc16","#0891b2"];

// ── Icon auto-detection ───────────────────────────────────────────────────────
function guessIcon(s: string): string {
    const l = s.toLowerCase();
    if (/user|client|person|human|customer|visitor|me/.test(l))           return "👤";
    if (/agent|agt|bot|ai|robot|llm|gpt|claude|assistant/.test(l))        return "🤖";
    if (/api|server|backend|svc|service|micro|http/.test(l))              return "🖥️";
    if (/db|database|sql|postgres|mysql|mongo|dynamo|data/.test(l))       return "🗄️";
    if (/cache|redis|memcache/.test(l))                                    return "⚡";
    if (/mcp|plugin|webhook|hook|connector/.test(l))                       return "🔌";
    if (/git|github|gitlab|repo|version|commit/.test(l))                   return "🌿";
    if (/web|browser|frontend|ui|react|next|html/.test(l))                 return "🌐";
    if (/mem|memory|context|claude\.md|knowledge/.test(l))                 return "🧠";
    if (/sh|shell|bash|terminal|cmd|cli|exec/.test(l))                     return "⚙️";
    if (/file|fs|storage|disk|s3|blob|drive/.test(l))                      return "📂";
    if (/cloud|aws|azure|gcp|infra|deploy/.test(l))                        return "☁️";
    if (/queue|msg|kafka|rabbit|sqs|pubsub|bus/.test(l))                   return "📨";
    if (/auth|security|oauth|jwt|sso|iam|key|secret/.test(l))              return "🔐";
    if (/search|elastic|algolia|query/.test(l))                             return "🔍";
    if (/log|monitor|metric|grafana|datadog|obs/.test(l))                  return "📊";
    if (/email|mail|smtp|send/.test(l))                                     return "📧";
    if (/pay|stripe|billing|invoice|wallet/.test(l))                        return "💳";
    if (/mobile|app|ios|android|phone/.test(l))                             return "📱";
    if (/ci|cd|pipeline|build|vercel|netlify|action/.test(l))               return "🚀";
    if (/test|spec|qa|lint|check/.test(l))                                  return "🧪";
    if (/notification|alert|notify|push/.test(l))                           return "🔔";
    return "📦";
}

// ── Parser ────────────────────────────────────────────────────────────────────
const DEFAULT_DIAGRAM_TITLE = "Sequence Diagram";

function parse(code: string): Diagram {
    const participants: Participant[] = [];
    const map = new Map<string, Participant>();
    const messages: SeqMsg[] = [];
    let step = 0, ci = 0;
    let title: string | undefined;
    function addP(id: string, label?: string) {
        if (!map.has(id)) {
            const p: Participant = { id, color: PAL[ci++ % PAL.length], label: (label ?? id).replace(/\[(.+?)\]/g, "($1)") };
            participants.push(p); map.set(id, p);
        }
    }
    for (const raw of code.split("\n")) {
        const l = raw.trim();
        if (!l || /^(%%|sequenceDiagram|autonumber|---|```)/.test(l)) continue;
        const tm = l.match(/^title:\s*(.+)$/i);
        if (tm) { title = tm[1].trim(); continue; }
        const pm = l.match(/^participant\s+(\S+)(?:\s+as\s+(.+))?$/i);
        if (pm) { addP(pm[1], pm[2]); continue; }
        const mm = l.match(/^(\w+)\s*(-->>|->>|-->|->)\s*(\w+):\s*(.*)$/);
        if (mm) {
            const [, fId, arr, tId, rawText] = mm;
            addP(fId); addP(tId);
            const cleaned = rawText.replace(/<br\s*\/?>/gi, " ").trim();
            const numPfx = cleaned.match(/^(\d+)\.\s+([\s\S]*)$/);
            messages.push({
                from: fId, to: tId,
                text: numPfx ? numPfx[2].trim() : cleaned,
                arrow: arr.startsWith("--") ? "dashed" : "solid",
                step: ++step,
                displayStep: numPfx ? parseInt(numPfx[1]) : undefined,
            });
        }
    }
    return { participants, messages, title };
}

// ── SVG Renderer ──────────────────────────────────────────────────────────────
function esc(s: string) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

const LIFELINE_DASH: Record<string, { da: string; cap?: string; sw?: number }> = {
    circle: { da: "0 8", cap: "round", sw: 3 },
    dot:    { da: "2 5" },
    small:  { da: "7 5" },
    long:   { da: "14 6" },
};

const THEMES: Record<string, { bg: string; titleFill: string; boxStroke: string; boxStrokeW: string; labelFill: string; plainTextFill: string }> = {
    light:   { bg: "#ffffff", titleFill: "#1e293b",  boxStroke: "#000000", boxStrokeW: "2",   labelFill: "white",   plainTextFill: "#1e293b" },
    dark:    { bg: "#16161e", titleFill: "#c0caf5",  boxStroke: "none",    boxStrokeW: "0",   labelFill: "white",   plainTextFill: "#c0caf5" },
    monokai: { bg: "#272822", titleFill: "#f8f8f2",  boxStroke: "none",    boxStrokeW: "0",   labelFill: "#272822", plainTextFill: "#f8f8f2" },
};

function buildSvg(d: Diagram, o: Opts, l: Layout): string {
    const { participants: ps, messages: ms } = d;
    if (!ps.length) return "";
    const N = ps.length;
    const BW = l.boxWidth;
    const ICON_EXTRA = o.showIcons ? 22 : 0;
    const BH = Math.max(28, Math.round(BW * 0.31)) + ICON_EXTRA;
    const BR = 6, HS = l.spacing, LP = l.margin ?? 50, MG = l.stepHeight;
    const AH = 8, SW = 50, SH = 36, FS = l.textSize;
    const diagramTitle = d.title ?? DEFAULT_DIAGRAM_TITLE;
    const TOP_PAD = l.margin;
    const BOT_PAD = l.margin;
    const TITLE_H = 50;
    const BIG_NUM_H = o.showBigNumbers ? 100 : 0;
    const TP = 50 + BIG_NUM_H;
    const cx = (i: number) => LP + BW / 2 + i * HS;
    const idx = new Map(ps.map((p, i) => [p.id, i]));
    const W = 2 * LP + (N - 1) * HS + BW;
    const VP = 44;
    const H = TOP_PAD + TITLE_H + TP + BH + VP + ms.length * MG + VP + BH + BOT_PAD;
    const lt = TOP_PAD + TITLE_H + TP + BH, lb = H - BOT_PAD - BH;
    const msgY = (s: number) => TOP_PAD + TITLE_H + TP + BH + VP + (s - 1) * MG;
    const f = `'${o.font}', sans-serif`;
    const ld = LIFELINE_DASH[o.lifelineDash] ?? LIFELINE_DASH.long;
    const lifelineSW = ld.sw ?? 1.5;
    const lifelineCapAttr = ld.cap ? ` stroke-linecap="${ld.cap}"` : "";
    const th = THEMES[o.theme] ?? THEMES.light;
    // circle-dot style for dashed (response) arrows
    const DASHED_STYLE = ` stroke-dasharray="0 7" stroke-linecap="round" stroke-width="2.5"`;
    const parts: string[] = [];
    parts.push(`<rect width="${W}" height="${H}" fill="${th.bg}"/>`);
    parts.push(`<text x="${W / 2}" y="${TOP_PAD + TITLE_H / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="24" font-weight="800" fill="${th.titleFill}">${esc(diagramTitle)}</text>`);
    ps.forEach((p, i) => {
        const c = o.coloredLines ? p.color + "60" : "#d1d5db";
        parts.push(`<line x1="${cx(i)}" y1="${lt}" x2="${cx(i)}" y2="${lb}" stroke="${c}" stroke-width="${lifelineSW}" stroke-dasharray="${ld.da}"${lifelineCapAttr}/>`);
    });
    const renderBox = (p: Participant, i: number, y: number) => {
        const x = cx(i) - BW / 2;
        parts.push(`<rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="${BR}" fill="${p.color}" stroke="${th.boxStroke}" stroke-width="${th.boxStrokeW}"/>`);
        if (o.showIcons) {
            const icon = o.icons[p.id] ?? guessIcon(p.label);
            parts.push(`<text x="${cx(i)}" y="${y + 20}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="15">${icon}</text>`);
            parts.push(`<text x="${cx(i)}" y="${y + BH - 10}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="700" fill="${th.labelFill}">${esc(p.label)}</text>`);
        } else {
            parts.push(`<text x="${cx(i)}" y="${y+BH/2+1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="700" fill="${th.labelFill}">${esc(p.label)}</text>`);
        }
        if (o.showBigNumbers) {
            parts.push(`<text x="${cx(i)}" y="${TOP_PAD + TITLE_H + 50 + BIG_NUM_H / 2}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="80" font-weight="900" fill="#000000" opacity="0.75">${i + 1}</text>`);
        }
    };
    ps.forEach((p, i) => renderBox(p, i, TOP_PAD + TITLE_H + TP));
    ms.forEach(msg => {
        const fi = idx.get(msg.from) ?? 0, ti = idx.get(msg.to) ?? 0;
        const y = msgY(msg.step);
        const fx = cx(fi), tx = cx(ti);
        const fp = ps[fi];
        const lc = o.coloredLines ? fp.color : "#374151";
        const tc = o.coloredText ? fp.color : th.plainTextFill;
        const pillTextFill = o.theme === "monokai" ? "#272822" : "#000000";
        if (fi === ti) {
            const isDashed = msg.arrow === "dashed";
            const pathStyle = isDashed ? `fill="none" stroke="${lc}"${DASHED_STYLE}` : `fill="none" stroke="${lc}" stroke-width="1.5"`;
            const selfX1 = o.coloredNumbers ? fx + 11 : fx;
            parts.push(`<path d="M${selfX1} ${y} H${fx+SW} V${y+SH} H${fx}" ${pathStyle}/>`);
            parts.push(`<polygon points="${fx},${y+SH} ${fx+AH},${y+SH-5} ${fx+AH},${y+SH+5}" fill="${lc}"/>`);
            if (o.coloredText) {
                const pillH = FS + 8, pillW = Math.max(40, msg.text.length * (FS * 0.62) + 12);
                const pillX = fx + SW + 5, pillY = y + SH / 2 - pillH / 2;
                parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fp.color}"/>`);
                parts.push(`<text x="${pillX + pillW / 2}" y="${pillY + pillH / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="600" fill="${pillTextFill}">${esc(msg.text)}</text>`);
            } else {
                parts.push(`<text x="${fx+SW+5}" y="${y+SH/2+1}" dominant-baseline="middle" font-family="${f}" font-size="${FS}" fill="${tc}">${esc(msg.text)}</text>`);
            }
        } else {
            const dir = tx > fx ? 1 : -1;
            const isDashed = msg.arrow === "dashed";
            const lineX1 = o.coloredNumbers ? fx + dir * 11 : fx;
            if (isDashed) {
                parts.push(`<line x1="${lineX1}" y1="${y}" x2="${tx-dir*AH}" y2="${y}" stroke="${lc}"${DASHED_STYLE}/>`);
                if (dir === 1) parts.push(`<polyline points="${tx-AH},${y-5} ${tx},${y} ${tx-AH},${y+5}" fill="none" stroke="${lc}" stroke-width="1.5"/>`);
                else           parts.push(`<polyline points="${tx+AH},${y-5} ${tx},${y} ${tx+AH},${y+5}" fill="none" stroke="${lc}" stroke-width="1.5"/>`);
            } else {
                parts.push(`<line x1="${lineX1}" y1="${y}" x2="${tx-dir*AH}" y2="${y}" stroke="${lc}" stroke-width="1.5"/>`);
                if (dir === 1) parts.push(`<polygon points="${tx},${y} ${tx-AH},${y-5} ${tx-AH},${y+5}" fill="${lc}"/>`);
                else           parts.push(`<polygon points="${tx},${y} ${tx+AH},${y-5} ${tx+AH},${y+5}" fill="${lc}"/>`);
            }
            const mid = (fx + tx) / 2;
            if (o.coloredText) {
                const pillH = FS + 8, pillW = Math.max(40, msg.text.length * (FS * 0.62) + 12);
                const pillY = y - pillH - 10;
                parts.push(`<rect x="${mid - pillW / 2}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fp.color}"/>`);
                parts.push(`<text x="${mid}" y="${pillY + pillH / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="600" fill="${pillTextFill}">${esc(msg.text)}</text>`);
            } else {
                parts.push(`<text x="${mid}" y="${y-8}" text-anchor="middle" font-family="${f}" font-size="${FS}" fill="${tc}">${esc(msg.text)}</text>`);
            }
        }
        if (o.coloredNumbers) {
            parts.push(`<circle cx="${fx}" cy="${y}" r="10" fill="${fp.color}" fill-opacity="0.2" stroke="${fp.color}" stroke-width="2"/>`);
            parts.push(`<text x="${fx}" y="${y+1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="11" font-weight="700" fill="#000000">${msg.displayStep ?? msg.step}</text>`);
        } else {
            parts.push(`<text x="${fx}" y="${y+1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="13" font-weight="700" fill="${th.plainTextFill}">${msg.displayStep ?? msg.step}</text>`);
        }
    });
    ps.forEach((p, i) => renderBox(p, i, H - BOT_PAD - BH));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

// ── Default Code ──────────────────────────────────────────────────────────────
const DEFAULT_CODE = `sequenceDiagram
    title: Claude Code — AI Dev Loop

    participant User
    participant CC as Claude Code [CLI]
    participant API as Claude API
    participant MEM as Memory [CLAUDE.md]
    participant MCP as MCP Server
    participant FS as File System
    participant SH as Shell / Bash
    participant GIT as Git
    participant AGT as Sub-Agent
    participant WEB as Web Search

    User->>CC: "Add auth to my app"
    CC->>MEM: Load project context & rules
    MEM-->>CC: CLAUDE.md + memory files
    CC->>API: Task + tools + full context
    API-->>CC: Reasoning plan + tool calls
    CC->>FS: Read source files [Glob, Grep, Read]
    FS-->>CC: Code structure & relevant files
    CC->>MCP: Fetch external docs & schemas
    MCP-->>CC: Reference data returned
    CC->>AGT: Spawn sub-agent [research]
    AGT->>WEB: Search auth best practices
    WEB-->>AGT: OAuth2 & JWT patterns
    AGT-->>CC: Research complete
    CC->>FS: Write implementation [Edit, Write]
    CC->>SH: Run tests & lint
    SH-->>CC: All tests passing
    CC->>GIT: Stage & commit changes
    GIT-->>CC: Committed successfully
    CC-->>User: Done — 3 files changed`;

// ── Slider row ────────────────────────────────────────────────────────────────
function SliderRow({ label, value, min, max, unit = "", fontSize = 12, onChange }: {
    label: string; value: number; min: number; max: number; unit?: string; fontSize?: number; onChange: (v: number) => void;
}) {
    return (
        <div>
            <div className="flex justify-between mb-1">
                <span style={{ fontSize, color: "#ffffff", fontWeight: 400 }}>{label}</span>
                <span style={{ fontSize, color: "#636366", fontWeight: 400 }}>{value}{unit}</span>
            </div>
            <input type="range" min={min} max={max} value={value}
                onChange={e => onChange(parseInt(e.target.value))}
                className="w-full" style={{ accentColor: "#0a84ff" }} />
        </div>
    );
}

// ── Icon button ───────────────────────────────────────────────────────────────
function IconBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:brightness-125"
            style={{ background: active ? "#0a84ff" : "#2a2a2c", color: "white" }}
        >{children}</button>
    );
}

// ── Settings content (shared between desktop panel + mobile sheet) ─────────────
function SettingsContent({
    opts, layout, copied, mobile = false, participants = [],
    upd, updL, exportPng, exportCode, exportJson, copyCode,
}: {
    opts: Opts; layout: Layout; copied: boolean; mobile?: boolean; participants?: Participant[];
    upd: (p: Partial<Opts>) => void;
    updL: (p: Partial<Layout>) => void;
    exportPng: () => void; exportCode: () => void; exportJson: () => void; copyCode: () => void;
}) {
    const fs = (base: number) => mobile ? Math.round(base * 1.2) : base;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Theme */}
            <div>
                <div style={{ fontSize: fs(10), fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Theme</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {(["light","dark","monokai"] as const).map(t => (
                        <button key={t} onClick={() => upd({ theme: t })}
                            style={{
                                padding: mobile ? "10px 4px" : "8px 4px", borderRadius: 10, fontSize: fs(11), fontWeight: 700,
                                textTransform: "capitalize", letterSpacing: "0.02em",
                                border: opts.theme === t ? "2px solid #0a84ff" : "2px solid transparent",
                                background: t === "light" ? "#f1f5f9" : t === "dark" ? "#16161e" : "#272822",
                                color: t === "light" ? "#1e293b" : t === "dark" ? "#c0caf5" : "#f8f8f2",
                                cursor: "pointer", transition: "border 0.15s",
                            }}
                        >{t}</button>
                    ))}
                </div>
            </div>

            <div style={{ height: 1, background: "#222" }} />

            <div>
                <div style={{ fontSize: fs(10), fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Style</div>
                <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 14 : 11 }}>
                    {([ ["coloredLines","Lines"], ["coloredNumbers","Numbers"], ["coloredText","Text Pill"], ["showIcons","Icons"], ["showBigNumbers","Big Numbers"] ] as const).map(([k, label]) => (
                        <div key={k} className="flex items-center justify-between cursor-pointer select-none"
                            onClick={() => upd({ [k]: !opts[k] } as Partial<Opts>)}>
                            <span style={{ fontSize: fs(13), color: "#bbb", fontWeight: 400 }}>{label}</span>
                            <div style={{
                                position: "relative", width: 42, height: 24, borderRadius: 12, flexShrink: 0,
                                background: opts[k] ? "#34c759" : "#333",
                                transition: "background 0.2s", cursor: "pointer",
                            }}>
                                <div style={{
                                    position: "absolute", top: 2, width: 20, height: 20, borderRadius: 10,
                                    background: "white", left: opts[k] ? 20 : 2,
                                    transition: "left 0.2s ease",
                                    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                                }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Icons editor — only when showIcons is on */}
            {opts.showIcons && participants.length > 0 && (
                <>
                    <div style={{ height: 1, background: "#222" }} />
                    <div>
                        <div style={{ fontSize: fs(10), fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Icons</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {participants.map(p => {
                                const current = opts.icons[p.id] ?? guessIcon(p.label);
                                return (
                                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <input
                                            type="text"
                                            value={current}
                                            onChange={e => {
                                                const chars = [...e.target.value];
                                                const emoji = chars[chars.length - 1] ?? "📦";
                                                upd({ icons: { ...opts.icons, [p.id]: emoji } });
                                            }}
                                            style={{
                                                width: 44, height: 40, flexShrink: 0,
                                                background: "#2a2a2c", border: "1px solid #444",
                                                borderRadius: 10, color: "white",
                                                fontSize: 20, textAlign: "center",
                                                outline: "none", cursor: "text",
                                            }}
                                        />
                                        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: fs(12), color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            <div style={{ height: 1, background: "#222" }} />

            <div>
                <div style={{ fontSize: fs(10), fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Layout</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <SliderRow label="Height" value={layout.stepHeight} min={30} max={80} fontSize={fs(12)} onChange={v => updL({ stepHeight: v })} />
                    <SliderRow label="Width" value={layout.boxWidth} min={80} max={180} fontSize={fs(12)} onChange={v => updL({ boxWidth: v })} />
                    <SliderRow label="Gap" value={layout.spacing} min={120} max={350} fontSize={fs(12)} onChange={v => updL({ spacing: v })} />
                    <SliderRow label="Font" value={layout.textSize} min={10} max={20} unit="px" fontSize={fs(12)} onChange={v => updL({ textSize: v })} />
                    <SliderRow label="Margin" value={layout.margin} min={120} max={200} fontSize={fs(12)} onChange={v => updL({ margin: v })} />
                </div>
            </div>

            <div style={{ height: 1, background: "#222" }} />

            <div>
                <div style={{ fontSize: fs(10), fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 9 }}>Export</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    <button onClick={exportPng}
                        className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                        style={{ background: "#f97316", color: "white", cursor: "pointer", padding: mobile ? "12px 0" : "10px 0", fontSize: fs(12) }}>
                        PNG
                    </button>
                    <button onClick={exportCode}
                        className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                        style={{ background: "#3b82f6", color: "white", cursor: "pointer", padding: mobile ? "12px 0" : "10px 0", fontSize: fs(12) }}>
                        Code
                    </button>
                    <button onClick={exportJson}
                        className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                        style={{ background: "#22c55e", color: "white", cursor: "pointer", padding: mobile ? "12px 0" : "10px 0", fontSize: fs(12) }}>
                        JSON
                    </button>
                    <button onClick={copyCode}
                        className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                        style={{ background: copied ? "#34c759" : "#8b5cf6", color: "white", cursor: "pointer", padding: mobile ? "12px 0" : "10px 0", fontSize: fs(12) }}>
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SequenceTool() {
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [code, setCode] = useState(DEFAULT_CODE);
    const [showCode, setShowCode] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [editorDark, setEditorDark] = useState(false);
    const [codeWidth, setCodeWidth] = useState(340);
    const [copied, setCopied] = useState(false);
    const [hasFit, setHasFit] = useState(false);
    const [fitActive, setFitActive] = useState(true);
    const [opts, setOpts] = useState<Opts>(DEFAULT_OPTS);
    const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
    const [zoom, setZoom] = useState(1.0);

    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [isPanning, setIsPanning] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);
    const resizeStartX = useRef(0);
    const resizeStartW = useRef(340);
    const isDragging = useRef(false);
    const dragStartMouse = useRef({ x: 0, y: 0 });
    const dragStartPan = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(1.0);
    const panRef = useRef({ x: 0, y: 0 });
    const spaceHeld = useRef(false);

    // Keep refs in sync for use in event handlers
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);
    useEffect(() => { panRef.current = { x: panX, y: panY }; }, [panX, panY]);

    // ── Resize drag (desktop) ───────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const delta = e.clientX - resizeStartX.current;
            setCodeWidth(Math.max(220, Math.min(780, resizeStartW.current + delta)));
        };
        const onUp = () => { isResizing.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    }, []);

    // ── Wheel: pan (no modifier) + zoom-to-cursor (ctrl/cmd) ─────────────
    useEffect(() => {
        if (!mounted) return;
        const el = canvasRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                // Zoom toward cursor
                const rect = el.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                const speed = e.deltaMode === 1 ? 0.06 : 0.004;
                const oldZoom = zoomRef.current;
                const newZoom = parseFloat(Math.min(4, Math.max(0.1, oldZoom - e.deltaY * speed)).toFixed(3));
                const ratio = newZoom / oldZoom;
                const newPanX = dx * (1 - ratio) + panRef.current.x * ratio;
                const newPanY = dy * (1 - ratio) + panRef.current.y * ratio;
                zoomRef.current = newZoom;
                panRef.current = { x: newPanX, y: newPanY };
                setZoom(newZoom);
                setPanX(newPanX);
                setPanY(newPanY);
                setFitActive(false);
            } else {
                // Pan (two-finger scroll, no modifier)
                const newPanX = panRef.current.x - e.deltaX;
                const newPanY = panRef.current.y - e.deltaY;
                panRef.current = { x: newPanX, y: newPanY };
                setPanX(newPanX);
                setPanY(newPanY);
            }
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [mounted]);

    // ── Touch: pinch-zoom + pan ───────────────────────────────────────────
    useEffect(() => {
        if (!mounted) return;
        const el = canvasRef.current;
        if (!el) return;

        let startTouchX = 0, startTouchY = 0;
        let startPanX = 0, startPanY = 0;
        let startPinchDist: number | null = null;
        let startZoomVal = 1;
        let startPinchPanX = 0, startPinchPanY = 0;
        let isTouchPanning = false;

        const getDist = (t: TouchList) => {
            const dx = t[0].clientX - t[1].clientX;
            const dy = t[0].clientY - t[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                startPinchDist = getDist(e.touches);
                startZoomVal = zoomRef.current;
                startPinchPanX = panRef.current.x;
                startPinchPanY = panRef.current.y;
                isTouchPanning = false;
            } else if (e.touches.length === 1) {
                isTouchPanning = true;
                startPinchDist = null;
                startTouchX = e.touches[0].clientX;
                startTouchY = e.touches[0].clientY;
                startPanX = panRef.current.x;
                startPanY = panRef.current.y;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && startPinchDist !== null) {
                e.preventDefault();
                const d = getDist(e.touches);
                const ratio = d / startPinchDist;
                const newZoom = parseFloat(Math.min(4, Math.max(0.1, startZoomVal * ratio)).toFixed(3));
                zoomRef.current = newZoom;
                panRef.current = { x: startPinchPanX, y: startPinchPanY };
                setZoom(newZoom);
                setPanX(startPinchPanX);
                setPanY(startPinchPanY);
                setFitActive(false);
            } else if (e.touches.length === 1 && isTouchPanning) {
                e.preventDefault();
                const newPanX = startPanX + (e.touches[0].clientX - startTouchX);
                const newPanY = startPanY + (e.touches[0].clientY - startTouchY);
                panRef.current = { x: newPanX, y: newPanY };
                setPanX(newPanX);
                setPanY(newPanY);
            }
        };

        const onTouchEnd = () => {
            startPinchDist = null;
            isTouchPanning = false;
        };

        el.addEventListener("touchstart", onTouchStart, { passive: false });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd);
        return () => {
            el.removeEventListener("touchstart", onTouchStart);
            el.removeEventListener("touchmove", onTouchMove);
            el.removeEventListener("touchend", onTouchEnd);
        };
    }, [mounted]);

    // ── Mouse drag pan ────────────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            const newPanX = dragStartPan.current.x + (e.clientX - dragStartMouse.current.x);
            const newPanY = dragStartPan.current.y + (e.clientY - dragStartMouse.current.y);
            panRef.current = { x: newPanX, y: newPanY };
            setPanX(newPanX);
            setPanY(newPanY);
        };
        const onUp = () => {
            if (isDragging.current) { isDragging.current = false; setIsPanning(false); }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    }, []);

    // ── Mount + localStorage ──────────────────────────────────────────────
    useEffect(() => {
        setMounted(true);
        setIsMobile(window.innerWidth < 768);
        const c = localStorage.getItem("nsd-code");
        if (c) setCode(c);
        try { const o = localStorage.getItem("nsd-opts"); if (o) setOpts(prev => ({ ...prev, ...JSON.parse(o) })); } catch {}
        try { const l = localStorage.getItem("nsd-layout"); if (l) setLayout(prev => ({ ...prev, ...JSON.parse(l) })); } catch {}
    }, []);

    // ── Mobile detection on resize ────────────────────────────────────────
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    // ── Persist ───────────────────────────────────────────────────────────
    useEffect(() => { if (mounted) localStorage.setItem("nsd-code", code); }, [code, mounted]);
    useEffect(() => { if (mounted) localStorage.setItem("nsd-opts", JSON.stringify(opts)); }, [opts, mounted]);
    useEffect(() => { if (mounted) localStorage.setItem("nsd-layout", JSON.stringify(layout)); }, [layout, mounted]);

    const diagram = useMemo(() => parse(code), [code]);
    const svg = useMemo(() => buildSvg(diagram, opts, layout), [diagram, opts, layout]);

    const svgDims = useMemo(() => {
        const m = svg.match(/width="(\d+)" height="(\d+)"/);
        return m ? { w: parseInt(m[1]), h: parseInt(m[2]) } : null;
    }, [svg]);

    const fitZoom = useCallback(() => {
        if (!canvasRef.current || !svgDims) return;
        const { clientWidth: cw, clientHeight: ch } = canvasRef.current;
        const newZoom = parseFloat(Math.min((cw - 48) / svgDims.w, (ch - 48) / svgDims.h).toFixed(3));
        zoomRef.current = newZoom;
        panRef.current = { x: 0, y: 0 };
        setZoom(newZoom);
        setPanX(0);
        setPanY(0);
        setFitActive(true);
    }, [svgDims]);

    useEffect(() => {
        if (svgDims && !hasFit) {
            const id = requestAnimationFrame(() => { fitZoom(); setHasFit(true); });
            return () => cancelAnimationFrame(id);
        }
    }, [svgDims, hasFit, fitZoom]);

    const panelMounted = useRef(false);
    useEffect(() => {
        if (!panelMounted.current) { panelMounted.current = true; return; }
        const id = requestAnimationFrame(() => fitZoom());
        return () => cancelAnimationFrame(id);
    }, [showSettings, showCode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Keyboard shortcuts (Figma-like) ───────────────────────────────────
    useEffect(() => {
        if (!mounted) return;
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "TEXTAREA" || tag === "INPUT") return;
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key === "0") { e.preventDefault(); fitZoom(); }
            if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); setZoom(z => parseFloat(Math.min(4, z + 0.15).toFixed(2))); setFitActive(false); }
            if (mod && e.key === "-") { e.preventDefault(); setZoom(z => parseFloat(Math.max(0.1, z - 0.15).toFixed(2))); setFitActive(false); }
            if (e.key === "f" || e.key === "F") fitZoom();
            if (e.key === " " && !e.repeat) { e.preventDefault(); spaceHeld.current = true; }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === " ") spaceHeld.current = false;
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
    }, [mounted, fitZoom]); // eslint-disable-line react-hooks/exhaustive-deps

    const upd = (p: Partial<Opts>) => setOpts(o => ({ ...o, ...p }));
    const updL = (p: Partial<Layout>) => setLayout(l => ({ ...l, ...p }));

    // ── Exports ───────────────────────────────────────────────────────────
    const EXPORT_LAYOUT: Layout = { stepHeight: 58, boxWidth: 160, spacing: 210, textSize: 14, margin: 60 };

    const exportPng = useCallback(() => {
        const exportSvg = buildSvg(diagram, opts, EXPORT_LAYOUT);
        if (!exportSvg) return;
        const url = URL.createObjectURL(new Blob([exportSvg], { type: "image/svg+xml" }));
        const img = new Image();
        img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width * 2; c.height = img.height * 2;
            const ctx = c.getContext("2d")!;
            ctx.scale(2, 2); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, img.width, img.height);
            ctx.drawImage(img, 0, 0);
            c.toBlob(b => { if (!b) return; const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "sequence.png"; a.click(); });
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }, [diagram, opts]);

    const exportCode = useCallback(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
        a.download = "diagram.txt"; a.click();
    }, [code]);

    const exportJson = useCallback(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(diagram, null, 2)], { type: "application/json" }));
        a.download = "diagram.json"; a.click();
    }, [diagram]);

    const copyCode = useCallback(() => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [code]);

    const fireConfetti = useCallback(() => {
        import("canvas-confetti").then(({ default: confetti }) => {
            const end = Date.now() + 5000;
            const colors = ["#ff595e","#ffca3a","#22c55e","#1982c4","#8ac926","#ff924c","#48cae4","#f97316"];
            let last = 0;
            const burst = (ts: number) => {
                if (ts - last > 50) {
                    last = ts;
                    confetti({ particleCount: 20, angle: 60, spread: 100, origin: { x: 0, y: 0.5 }, colors });
                    confetti({ particleCount: 20, angle: 120, spread: 100, origin: { x: 1, y: 0.5 }, colors });
                    confetti({ particleCount: 15, spread: 130, startVelocity: 50, origin: { x: Math.random(), y: 0 }, colors });
                }
                if (Date.now() < end) requestAnimationFrame(burst);
                else confetti.reset();
            };
            requestAnimationFrame(burst);
        });
    }, []);

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const pasted = e.clipboardData.getData("text");
        const parsed = parse(pasted);
        if (parsed.participants.length >= 2) setTimeout(fireConfetti, 150);
    }, [fireConfetti]);

    const zoomPct = Math.round(zoom * 100);

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>

            {/* ── HEADER ── */}
            <header className="flex items-center px-4 shrink-0"
                style={{ height: 54, background: "#111113", borderBottom: "1px solid #27272a" }}>
                <span className="font-bold text-[16px] tracking-tight" style={{ color: "#f4f4f5", letterSpacing: "-0.3px" }}>
                    Mermaid++
                </span>
                <div className="flex-1" />
                <div className="flex gap-2">
                    <IconBtn active={showCode} onClick={() => { setShowCode(v => !v); if (showSettings) setShowSettings(false); }}>
                        <Code2 size={20} strokeWidth={2} />
                    </IconBtn>
                    <IconBtn active={showSettings} onClick={() => { setShowSettings(v => !v); if (showCode && isMobile) setShowCode(false); }}>
                        <SlidersHorizontal size={20} strokeWidth={2} />
                    </IconBtn>
                </div>
            </header>

            {/* ── BODY ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* Desktop: Code editor side panel */}
                {!isMobile && showCode && (
                    <div className="flex shrink-0 relative" style={{ width: codeWidth }}>
                        <div className="flex flex-col flex-1 overflow-hidden border-r"
                            style={{
                                background: editorDark ? "#0d1117" : "#ffffff",
                                borderColor: editorDark ? "#1e2334" : "#e2e8f0",
                            }}>
                            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                                style={{
                                    borderColor: editorDark ? "#1e2334" : "#e2e8f0",
                                    background: editorDark ? "#0a0f1e" : "#f8fafc",
                                }}>
                                <span className="text-[9px] font-bold uppercase tracking-widest"
                                    style={{ color: editorDark ? "#4a5568" : "#94a3b8" }}>Code</span>
                                <div className="flex items-center gap-1">
                                    <button onClick={copyCode} title="Copy code"
                                        className="h-6 px-2 rounded flex items-center justify-center text-[10px] font-semibold transition-all"
                                        style={{ color: copied ? "#22c55e" : (editorDark ? "#64748b" : "#94a3b8"), background: copied ? (editorDark ? "rgba(34,197,94,0.12)" : "rgba(34,197,94,0.08)") : "transparent" }}
                                    >{copied ? "Copied" : "Copy"}</button>
                                    <button onClick={() => setEditorDark(v => !v)} title={editorDark ? "Light mode" : "Dark mode"}
                                        className="w-6 h-6 rounded flex items-center justify-center text-sm"
                                        style={{ color: editorDark ? "#7dd3fc" : "#64748b" }}
                                    >{editorDark ? "☀" : "☾"}</button>
                                </div>
                            </div>
                            <textarea
                                data-testid="code-editor"
                                className="flex-1 resize-none outline-none p-4"
                                spellCheck={false}
                                value={code}
                                onChange={e => setCode(e.target.value)}
                                onPaste={handlePaste}
                                style={{
                                    background: "transparent",
                                    color: editorDark ? "#8892a4" : "#1e293b",
                                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                    fontSize: "12.5px",
                                    lineHeight: 1.75,
                                    border: "none",
                                }}
                            />
                        </div>
                        {/* Drag handle */}
                        <div
                            onMouseDown={e => {
                                isResizing.current = true;
                                resizeStartX.current = e.clientX;
                                resizeStartW.current = codeWidth;
                                document.body.style.cursor = "col-resize";
                                document.body.style.userSelect = "none";
                                e.preventDefault();
                            }}
                            className="absolute right-0 top-0 bottom-0 flex items-center justify-center z-10"
                            style={{ width: 8, cursor: "col-resize" }}
                        >
                            <div className="h-12 rounded-full w-1"
                                style={{ background: editorDark ? "#2a3148" : "#e2e8f0" }} />
                        </div>
                    </div>
                )}

                {/* ── Diagram canvas ── */}
                <div className="flex-1 relative" style={{ background: "#c8d0da" }}>
                    <div ref={canvasRef} className="absolute inset-0 overflow-hidden"
                        style={{ cursor: isPanning ? "grabbing" : "grab", touchAction: "none" }}
                        onMouseDown={e => {
                            if ((e.target as HTMLElement).closest("button")) return;
                            isDragging.current = true;
                            setIsPanning(true);
                            dragStartMouse.current = { x: e.clientX, y: e.clientY };
                            dragStartPan.current = { x: panRef.current.x, y: panRef.current.y };
                            e.preventDefault();
                        }}
                        onDoubleClick={e => {
                            if ((e.target as HTMLElement).closest("button")) return;
                            const rect = canvasRef.current!.getBoundingClientRect();
                            const dx = e.clientX - (rect.left + rect.width / 2);
                            const dy = e.clientY - (rect.top + rect.height / 2);
                            const oldZoom = zoomRef.current;
                            const newZoom = parseFloat(Math.min(4, oldZoom * 1.5).toFixed(3));
                            const ratio = newZoom / oldZoom;
                            const newPanX = dx * (1 - ratio) + panRef.current.x * ratio;
                            const newPanY = dy * (1 - ratio) + panRef.current.y * ratio;
                            zoomRef.current = newZoom;
                            panRef.current = { x: newPanX, y: newPanY };
                            setZoom(newZoom); setPanX(newPanX); setPanY(newPanY); setFitActive(false);
                        }}
                    >
                        {mounted && svg ? (
                            <div
                                style={{
                                    position: "absolute",
                                    top: "50%", left: "50%",
                                    transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom})`,
                                    transformOrigin: "center center",
                                    willChange: "transform",
                                }}
                                dangerouslySetInnerHTML={{ __html: svg }}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                {mounted && (
                                    <span className="text-sm text-center px-6" style={{ color: "#94a3b8" }}>
                                        No diagram — open the code editor and enter sequence syntax.
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Zoom toolbar */}
                    {mounted && (
                        <div
                            className="absolute bottom-4 z-10 flex items-center"
                            style={{
                                left: "50%", transform: "translateX(-50%)",
                                background: "white",
                                border: "1px solid #e2e8f0",
                                borderRadius: 12,
                                padding: isMobile ? "4px 8px" : "3px 10px",
                                boxShadow: "0 2px 16px rgba(0,0,0,0.12)",
                                gap: isMobile ? 0 : 2,
                                whiteSpace: "nowrap",
                            }}
                        >
                            <button
                                onClick={() => { setZoom(z => parseFloat(Math.max(0.2, z - 0.1).toFixed(2))); setFitActive(false); }}
                                className="flex items-center justify-center rounded hover:bg-black/5 transition-all"
                                style={{ width: isMobile ? 38 : 24, height: isMobile ? 38 : 24, color: "#64748b", fontSize: isMobile ? 22 : 18, lineHeight: 1 }}
                            >−</button>

                            <span style={{ color: "#1e293b", fontSize: isMobile ? 13 : 11, fontWeight: 600, minWidth: isMobile ? 48 : 38, textAlign: "center" }}>
                                {zoomPct}%
                            </span>

                            <button
                                onClick={() => { setZoom(z => parseFloat(Math.min(4, z + 0.1).toFixed(2))); setFitActive(false); }}
                                className="flex items-center justify-center rounded hover:bg-black/5 transition-all"
                                style={{ width: isMobile ? 38 : 24, height: isMobile ? 38 : 24, color: "#64748b", fontSize: isMobile ? 22 : 18, lineHeight: 1 }}
                            >+</button>

                            <div style={{ width: 1, height: 14, background: "#e2e8f0", margin: isMobile ? "0 6px" : "0 6px" }} />

                            {/* Desktop: preset zoom buttons */}
                            {!isMobile && [50, 75, 100, 150, 200].map(p => (
                                <button
                                    key={p}
                                    onClick={() => { setZoom(p / 100); setFitActive(false); }}
                                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold transition-all hover:bg-black/5"
                                    style={{
                                        color: !fitActive && zoomPct === p ? "#3b82f6" : "#64748b",
                                        background: !fitActive && zoomPct === p ? "rgba(59,130,246,0.08)" : "transparent",
                                    }}
                                >{p}%</button>
                            ))}

                            {!isMobile && <div style={{ width: 1, height: 14, background: "#e2e8f0", margin: "0 6px" }} />}

                            <button
                                onClick={fitZoom}
                                className="rounded hover:bg-black/5 transition-all"
                                style={{
                                    padding: isMobile ? "0 10px" : "0 8px",
                                    height: isMobile ? 38 : "auto",
                                    paddingTop: isMobile ? 0 : "2px",
                                    paddingBottom: isMobile ? 0 : "2px",
                                    fontSize: isMobile ? 13 : 10,
                                    fontWeight: 700,
                                    color: fitActive ? "#3b82f6" : "#64748b",
                                    background: fitActive ? "rgba(59,130,246,0.08)" : "transparent",
                                    letterSpacing: "0.04em",
                                }}
                            >Fit</button>

                            {!isMobile && <>
                                <div style={{ width: 1, height: 14, background: "#e2e8f0", margin: "0 6px" }} />
                                <div style={{ position: "relative" }}>
                                    <button
                                        onClick={() => setShowShortcuts(v => !v)}
                                        className="flex items-center justify-center rounded hover:bg-black/5 transition-all"
                                        style={{ width: 20, height: 20, fontSize: 10, fontWeight: 700, color: showShortcuts ? "#3b82f6" : "#94a3b8", border: `1px solid ${showShortcuts ? "#3b82f6" : "#cbd5e1"}`, borderRadius: "50%", lineHeight: 1 }}
                                    >?</button>
                                    {showShortcuts && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                bottom: "calc(100% + 10px)",
                                                right: 0,
                                                background: "white",
                                                border: "1px solid #e2e8f0",
                                                borderRadius: 10,
                                                boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
                                                padding: "12px 14px",
                                                minWidth: 220,
                                                zIndex: 50,
                                            }}
                                        >
                                            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>Keyboard Shortcuts</div>
                                            {[
                                                ["Scroll", "Pan canvas"],
                                                ["Ctrl+Scroll", "Zoom to cursor"],
                                                ["Double-click", "Zoom in 1.5×"],
                                                ["Space+Drag", "Pan canvas"],
                                                ["F", "Fit to window"],
                                                ["⌘0 / Ctrl+0", "Fit to window"],
                                                ["⌘+ / Ctrl++", "Zoom in"],
                                                ["⌘− / Ctrl+−", "Zoom out"],
                                            ].map(([key, desc]) => (
                                                <div key={key} className="flex items-center justify-between" style={{ gap: 12, marginBottom: 5 }}>
                                                    <code style={{ fontSize: 10, background: "#f1f5f9", color: "#334155", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", whiteSpace: "nowrap" }}>{key}</code>
                                                    <span style={{ fontSize: 11, color: "#64748b" }}>{desc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>}
                        </div>
                    )}
                </div>

                {/* Desktop: Settings panel */}
                {!isMobile && showSettings && (
                    <div className="shrink-0 flex flex-col" style={{ width: 268, background: "#161618", borderLeft: "1px solid #2a2a2a" }}>
                        <div className="flex items-center justify-between shrink-0"
                            style={{ padding: "0 16px", height: 54, borderBottom: "1px solid #2a2a2a" }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", letterSpacing: "-0.2px" }}>Settings</span>
                            <button onClick={() => setShowSettings(false)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all"
                                style={{ color: "#555" }}>
                                <X size={14} strokeWidth={2.5} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto" style={{ padding: "20px 16px" }}>
                            <SettingsContent opts={opts} layout={layout} copied={copied} participants={diagram.participants}
                                upd={upd} updL={updL} exportPng={exportPng} exportCode={exportCode} exportJson={exportJson} copyCode={copyCode} />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Mobile: Code editor full-screen overlay ── */}
            {isMobile && showCode && (
                <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0d1117" }}>
                    <div className="flex items-center justify-between px-4 shrink-0"
                        style={{ height: 54, background: "#0a0f1e", borderBottom: "1px solid #1e2334" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            Code Editor
                        </span>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={copyCode}
                                style={{ fontSize: 13, fontWeight: 600, color: copied ? "#22c55e" : "#64748b", padding: "6px 0" }}
                            >{copied ? "Copied!" : "Copy"}</button>
                            <button
                                onClick={() => setShowCode(false)}
                                className="w-9 h-9 rounded-full flex items-center justify-center"
                                style={{ background: "#1e2334", color: "#94a3b8" }}>
                                <X size={16} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                    <textarea
                        className="flex-1 resize-none outline-none"
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        onPaste={handlePaste}
                        style={{
                            background: "transparent",
                            color: "#8892a4",
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: "16px",
                            lineHeight: 1.8,
                            border: "none",
                            padding: "16px",
                        }}
                    />
                    {/* Done button */}
                    <div className="shrink-0 px-4 py-3" style={{ borderTop: "1px solid #1e2334", background: "#0a0f1e" }}>
                        <button
                            onClick={() => setShowCode(false)}
                            className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                            style={{ background: "#0a84ff", color: "white" }}
                        >Done</button>
                    </div>
                </div>
            )}

            {/* ── Mobile: Settings bottom sheet ── */}
            {isMobile && showSettings && (
                <div
                    className="fixed inset-0 z-50"
                    style={{ background: "rgba(0,0,0,0.5)" }}
                    onClick={() => setShowSettings(false)}
                >
                    <div
                        className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl overflow-hidden"
                        style={{ background: "#161618", maxHeight: "84vh" }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Pull handle */}
                        <div className="flex justify-center pt-3 pb-1 shrink-0">
                            <div style={{ width: 36, height: 4, background: "#333", borderRadius: 2 }} />
                        </div>
                        {/* Sheet header */}
                        <div className="flex items-center justify-between shrink-0"
                            style={{ padding: "8px 20px 12px", borderBottom: "1px solid #2a2a2a" }}>
                            <span style={{ fontSize: 17, fontWeight: 600, color: "#fff", letterSpacing: "-0.3px" }}>Settings</span>
                            <button
                                onClick={() => setShowSettings(false)}
                                className="w-8 h-8 rounded-full flex items-center justify-center"
                                style={{ background: "#222", color: "#666" }}>
                                <X size={15} strokeWidth={2.5} />
                            </button>
                        </div>
                        {/* Sheet content */}
                        <div className="flex-1 overflow-y-auto" style={{ padding: "20px 20px 40px" }}>
                            <SettingsContent opts={opts} layout={layout} copied={copied} mobile={true} participants={diagram.participants}
                                upd={upd} updL={updL} exportPng={exportPng} exportCode={exportCode} exportJson={exportJson} copyCode={copyCode} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
