"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { CuteToast, showToast } from "@/app/CuteToast";
import type { User } from "@supabase/supabase-js";
import confetti from "canvas-confetti";

type Diagram = {
  id: string; title: string; slug: string;
  diagram_type: string; created_at: string; updated_at: string; code: string;
  is_favorite: boolean; tags: string[];
};

// ── Shared (public) ───────────────────────────────────────────────────────────
const LS_SHARED = "diagram:shared";
function loadShared(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_SHARED) ?? "[]")); } catch { return new Set(); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Matches the editor's PAL array exactly so minimap colors == rendered diagram colors
const PALETTE = ["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#f43f5e","#84cc16","#0891b2"];

function relativeTime(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Diagram type icon ─────────────────────────────────────────────────────────
function DiagramTypeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1c1e21" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={18} cy={5} r={3} /><circle cx={6} cy={12} r={3} /><circle cx={18} cy={19} r={3} />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  );
}

// ── Diagram minimap ───────────────────────────────────────────────────────────
function DiagramMinimap({ code, type }: { code: string; type: string }) {
  const W = 224, H = 112;
  // Strip YAML frontmatter (---...---) before parsing
  const stripped = (() => {
    const all = code.split("\n");
    if (all[0]?.trim() !== "---") return code;
    const end = all.findIndex((l, i) => i > 0 && l.trim() === "---");
    return end === -1 ? code : all.slice(end + 1).join("\n").trimStart();
  })();
  const rawLines = stripped.split("\n");
  const lines = rawLines.map(l => l.trim()).filter(l => l && !l.startsWith("%%"));
  // Always detect type from code — stored diagram_type in DB can be stale
  const firstLine = lines.find(l => l.length > 0) ?? "";
  const detectedType = /^sequenceDiagram/i.test(firstLine) ? "sequence"
    : /^(flowchart|graph)\s/i.test(firstLine) ? "flowchart"
    : type;
  const svgStyle: React.CSSProperties = { display: "block", background: "#ffffff", borderRadius: 8 };

  // ── Sequence — show ALL participants, exact colors matching editor ───────────
  if (detectedType === "sequence") {
    const seen = new Map<string, string>();
    for (const line of lines) {
      const asM = line.match(/^(?:participant|actor)\s+(\S+)\s+as\s+(.+)$/i);
      const idM = line.match(/^(?:participant|actor)\s+(\S+)/i);
      if (asM) seen.set(asM[1], asM[2].trim().replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, "").slice(0, 4));
      else if (idM && !idM[1].match(/^(sequenceDiagram|autonumber)$/i)) seen.set(idM[1], idM[1].slice(0, 4));
    }
    if (seen.size === 0) {
      for (const line of lines) {
        const m = line.match(/^(\S+)\s*(?:-->>|->>|-->|-x|->)\s*(\S+)\s*:/);
        if (m) { if (!seen.has(m[1])) seen.set(m[1], m[1].slice(0, 4)); if (!seen.has(m[2])) seen.set(m[2], m[2].slice(0, 4)); }
      }
    }
    const participants = [...seen.keys()]; // no cap — show ALL
    const n = participants.length;
    if (n === 0) return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle} />;
    // slot = equal share of width per participant; box fills 60% of slot, gap is 40%
    const slot = W / n;
    const BOX_W = Math.min(28, slot * 0.6);
    const BOX_H = Math.max(5, Math.min(11, BOX_W * 0.38));
    const xs = participants.map((_, i) => slot * i + slot / 2);
    const colors = participants.map((_, i) => PALETTE[i % PALETTE.length]);
    const TOP_Y = 4;
    const BOT_Y = H - BOX_H - 4;
    const LIFE_TOP = TOP_Y + BOX_H + 1;
    const LIFE_BOT = BOT_Y - 1;
    const LIFE_MID = (LIFE_TOP + LIFE_BOT) / 2;
    const numSize = Math.max(5, Math.min(8, BOX_W * 0.55));
    const msgs: { fi: number; ti: number }[] = [];
    for (const line of lines) {
      const m = line.match(/^(\S+)\s*(?:-->>|->>|-->|-x|->)\s*(\S+)\s*:/);
      if (m) { const fi = participants.indexOf(m[1]), ti = participants.indexOf(m[2]); if (fi >= 0 && ti >= 0 && fi !== ti) msgs.push({ fi, ti }); }
    }
    const maxM = Math.min(msgs.length, 8);
    const msgGap = maxM > 0 ? (LIFE_BOT - LIFE_TOP - 4) / maxM : 0;
    const arrowW = n > 6 ? 0.7 : 1;
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {/* lifelines — two segments so they skip around the circle */}
        {xs.map((x, i) => {
          const r = numSize * 0.9 + 1.5; // gap slightly larger than circle radius
          return (
            <g key={`ll${i}`}>
              <line x1={x} y1={LIFE_TOP} x2={x} y2={LIFE_MID - r} stroke={colors[i]} strokeWidth={0.8} opacity={0.5} />
              <line x1={x} y1={LIFE_MID + r} x2={x} y2={LIFE_BOT} stroke={colors[i]} strokeWidth={0.8} opacity={0.5} />
            </g>
          );
        })}
        {/* top boxes */}
        {xs.map((x, i) => (
          <rect key={`pt${i}`} x={x - BOX_W / 2} y={TOP_Y} width={BOX_W} height={BOX_H} rx={2} fill={colors[i]} />
        ))}
        {/* bottom boxes */}
        {xs.map((x, i) => (
          <rect key={`pb${i}`} x={x - BOX_W / 2} y={BOT_Y} width={BOX_W} height={BOX_H} rx={2} fill={colors[i]} />
        ))}
        {/* sequence number in a circle on lifeline midpoint */}
        {xs.map((x, i) => {
          const r = numSize * 0.9;
          return (
            <g key={`n${i}`}>
              <circle cx={x} cy={LIFE_MID} r={r} fill={colors[i]} fillOpacity={0.18} stroke={colors[i]} strokeWidth={0.8} strokeOpacity={0.7} />
              <text x={x} y={LIFE_MID + numSize * 0.35} textAnchor="middle" fill={colors[i]} fontSize={numSize} fontWeight="700" fontFamily="system-ui,sans-serif" opacity={0.9}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Flowchart / Graph ────────────────────────────────────────────────────────
  if (detectedType === "flowchart" || detectedType === "graph") {
    const nodeMap = new Map<string, string>();
    const edgeList: [string, string][] = [];
    for (const line of lines) {
      for (const m of [...line.matchAll(/\b([A-Za-z0-9_]+)\s*[\[\(\{]([^\]\)\}]{1,20})[\]\)\}]/g)]) {
        if (!["graph","flowchart","subgraph","end"].includes(m[1].toLowerCase())) nodeMap.set(m[1], m[2].replace(/["']/g,"").trim().slice(0,6));
      }
      const em = line.match(/([A-Za-z0-9_]+)\s*(?:-->|---|--[^>]*>|-\.-?>|==+>)\s*([A-Za-z0-9_]+)/);
      if (em) { if (!nodeMap.has(em[1])) nodeMap.set(em[1], em[1].slice(0,4)); if (!nodeMap.has(em[2])) nodeMap.set(em[2], em[2].slice(0,4)); edgeList.push([em[1], em[2]]); }
    }
    const nodeIds = [...nodeMap.keys()].slice(0, 8);
    if (nodeIds.length === 0) return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle}>
        {PALETTE.slice(0,5).map((c,i) => <circle key={i} cx={W/2+(i-2)*22} cy={H/2} r={9} fill={c} opacity={0.6} />)}
      </svg>
    );
    const childMap = new Map<string, string[]>();
    edgeList.forEach(([f,t]) => { if (!childMap.has(f)) childMap.set(f,[]); childMap.get(f)!.push(t); });
    const hasParent = new Set(edgeList.map(([,t]) => t));
    const roots = nodeIds.filter(id => !hasParent.has(id));
    if (roots.length === 0) roots.push(nodeIds[0]);
    const layers: string[][] = [];
    const visited = new Set<string>();
    let q = [...new Set(roots)].slice(0, 4);
    while (q.length && layers.length < 4) {
      const layer = q.filter(id => !visited.has(id)).slice(0,4);
      if (!layer.length) break;
      layers.push(layer); layer.forEach(id => visited.add(id));
      const nxt: string[] = [];
      layer.forEach(id => (childMap.get(id) ?? []).filter(c => !visited.has(c)).forEach(c => nxt.push(c)));
      q = [...new Set(nxt)];
    }
    nodeIds.filter(id => !visited.has(id)).forEach(id => { if ((layers[layers.length-1]?.length ?? 4) < 4) layers[layers.length-1].push(id); else layers.push([id]); });
    const positions = new Map<string, [number, number]>();
    layers.forEach((layer, li) => {
      const y = 20 + li * ((H - 30) / Math.max(layers.length - 1, 1));
      layer.forEach((id, ni) => positions.set(id, [(W * (ni + 1)) / (layer.length + 1), y]));
    });
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {edgeList.slice(0,12).map(([f,t], i) => { const fp=positions.get(f), tp=positions.get(t); if (!fp||!tp) return null; return <line key={`e${i}`} x1={fp[0]} y1={fp[1]} x2={tp[0]} y2={tp[1]} stroke="#d1d5db" strokeWidth={1.5} />; })}
        {[...positions.entries()].map(([id,[x,y]], i) => (
          <g key={`n${i}`}>
            <rect x={x-18} y={y-10} width={36} height={20} rx={4} fill={PALETTE[i % PALETTE.length]} />
            </g>
        ))}
      </svg>
    );
  }

  // ── Mindmap ──────────────────────────────────────────────────────────────────
  if (type === "mindmap") {
    const indents: [number, string][] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("%%") || /^mindmap$/i.test(trimmed)) continue;
      indents.push([line.length - line.trimStart().length, trimmed.replace(/[`"'()[\]{}]/g,"").trim()]);
    }
    if (!indents.length) return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle} />;
    const rootIndent = indents[0][0], rootLabel = indents[0][1].slice(0,7);
    // Detect actual child indent level (first indent strictly greater than root)
    let childIndent = rootIndent + 2;
    for (let i = 1; i < indents.length; i++) {
      if (indents[i][0] > rootIndent) { childIndent = indents[i][0]; break; }
    }
    const children: string[] = [];
    const gcMap = new Map<number, string[]>();
    let lastIdx = -1;
    for (let i = 1; i < indents.length; i++) {
      const [ind, txt] = indents[i];
      if (!txt) continue;
      if (ind === childIndent) { children.push(txt.slice(0,6)); lastIdx = children.length - 1; }
      else if (ind > childIndent && lastIdx >= 0) { if (!gcMap.has(lastIdx)) gcMap.set(lastIdx,[]); const a=gcMap.get(lastIdx)!; if (a.length<2) a.push(txt.slice(0,5)); }
    }
    // Tree layout: root at top-center, children spread across middle row, grandchildren below
    const n = Math.min(children.length, 6);
    const ROOT_X = W / 2, ROOT_Y = 14, ROOT_R = 14;
    const CHILD_Y = 55, CHILD_R = 9;
    const GC_Y = 92, GC_R = 6;
    const childXs = Array.from({length: n}, (_, i) => n === 1 ? W/2 : 18 + i * ((W - 36) / Math.max(n - 1, 1)));
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {childXs.map((x, i) => {
          const color = PALETTE[i % PALETTE.length];
          const gc = gcMap.get(i) ?? [];
          const gcCount = Math.min(gc.length, 2);
          const gcXs = gcCount === 1 ? [x] : gcCount === 2 ? [x - 14, x + 14] : [];
          return (
            <g key={`ch${i}`}>
              <line x1={ROOT_X} y1={ROOT_Y + ROOT_R} x2={x} y2={CHILD_Y - CHILD_R} stroke={color} strokeWidth={1.5} opacity={0.5} />
              {gcXs.map((gx, j) => (
                <g key={j}>
                  <line x1={x} y1={CHILD_Y + CHILD_R} x2={gx} y2={GC_Y - GC_R} stroke={color} strokeWidth={1} opacity={0.4} />
                  <circle cx={gx} cy={GC_Y} r={GC_R} fill={color} opacity={0.5} />
                </g>
              ))}
              <circle cx={x} cy={CHILD_Y} r={CHILD_R} fill={color} />
            </g>
          );
        })}
        <circle cx={ROOT_X} cy={ROOT_Y} r={ROOT_R} fill="#1e293b" />
      </svg>
    );
  }

  // ── Pie ──────────────────────────────────────────────────────────────────────
  if (type === "pie") {
    const slices: [number, string][] = [];
    for (const line of lines) { const m=line.match(/^\s*"([^"]+)"\s*:\s*([\d.]+)/); if (m) slices.push([parseFloat(m[2]), m[1].slice(0,8)]); }
    const total = slices.reduce((s,[v]) => s+v, 0);
    if (!total) return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle} />;
    const cx=W/2, cy=H/2, r=Math.min(W,H)*0.38;
    let sa = -Math.PI/2;
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {slices.slice(0,8).map(([v],i) => {
          const sweep=(v/total)*2*Math.PI, ea=sa+sweep;
          const x1=cx+r*Math.cos(sa),y1=cy+r*Math.sin(sa),x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea);
          const d=`M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${sweep>Math.PI?1:0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
          sa=ea; return <path key={i} d={d} fill={PALETTE[i%PALETTE.length]} stroke="#fff" strokeWidth={1.5} />;
        })}
      </svg>
    );
  }

  // ── Class / ER ────────────────────────────────────────────────────────────────
  if (type === "class" || type === "er") {
    const names: string[] = [];
    const rels: [string, string][] = [];
    for (const line of lines) {
      const nm = type==="class" ? line.match(/^class\s+(\w+)/) : line.match(/^([A-Z][A-Z0-9_]+)\s*\{/);
      if (nm && !names.includes(nm[1])) names.push(nm[1]);
      const rm = line.match(/(\w+)\s*(?:--|<\|--|\|\|--|o\{--|-->|\.\.>)\s*(\w+)/);
      if (rm) rels.push([rm[1], rm[2]]);
    }
    const n = Math.min(names.length, 6);
    if (!n) return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle} />;
    const cols=n<=3?n:Math.ceil(n/2), rows=Math.ceil(n/cols);
    const padX=20, padY=18, cellW=(W-2*padX)/cols, cellH=(H-2*padY)/rows;
    const positions = new Map<string,[number,number]>();
    names.slice(0,n).forEach((name,i) => positions.set(name,[padX+(i%cols)*cellW+cellW/2, padY+Math.floor(i/cols)*cellH+cellH/2]));
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {rels.slice(0,8).map(([f,t],i) => { const fp=positions.get(f),tp=positions.get(t); if (!fp||!tp) return null; return <line key={`r${i}`} x1={fp[0]} y1={fp[1]} x2={tp[0]} y2={tp[1]} stroke="#d1d5db" strokeWidth={1.5} />; })}
        {[...positions.entries()].map(([name,[x,y]],i) => (
          <g key={`e${i}`}>
            <rect x={x-22} y={y-12} width={44} height={24} rx={4} fill={PALETTE[i%PALETTE.length]} />
            </g>
        ))}
      </svg>
    );
  }

  // ── Gantt ─────────────────────────────────────────────────────────────────────
  if (type === "gantt") {
    const sections: { name: string; tasks: number }[] = [];
    let cur="", tc=0;
    for (const line of lines) {
      const sm=line.match(/^section\s+(.+)/i);
      if (sm) { if (cur) sections.push({name:cur,tasks:Math.max(tc,1)}); cur=sm[1].trim(); tc=0; }
      else if (line.includes(":") && !line.match(/^(gantt|title|dateFormat|axisFormat|excludes)/i)) tc++;
    }
    if (cur||tc>0) sections.push({name:cur||"Tasks",tasks:Math.max(tc,1)});
    if (!sections.length) sections.push({name:"Tasks",tasks:3});
    const n=Math.min(sections.length,5), totalT=sections.slice(0,n).reduce((s,sec)=>s+sec.tasks,0);
    const rowH=(H-16)/n, barH=Math.min(14,rowH-6);
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {sections.slice(0,n).map((sec,i) => {
          const y=10+i*rowH+(rowH-barH)/2, barW=Math.max(16,(sec.tasks/totalT)*(W-44)), offset=Math.round((i/(Math.max(n-1,1)))*18);
          return (
            <g key={i}>
              <text x={27} y={y+barH*0.68} textAnchor="end" fill="#9ca3af" fontSize={7}>{sec.name.slice(0,5)}</text>
              <rect x={30+offset} y={y} width={barW} height={barH} rx={3} fill={PALETTE[i%PALETTE.length]} opacity={0.8} />
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Generic / GitGraph / Journey — horizontal connected boxes ────────────────
  const count = Math.min(Math.max(lines.length, 3), 5);
  const gap = 8, boxH = 22, boxW = (W - (count + 1) * gap) / count;
  const by = H / 2 - boxH / 2;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
      {Array.from({length: count - 1}, (_, i) => {
        const x1 = gap + i * (boxW + gap) + boxW, x2 = gap + (i + 1) * (boxW + gap);
        return (
          <g key={`a${i}`}>
            <line x1={x1} y1={H/2} x2={x2 - 4} y2={H/2} stroke="#cbd5e1" strokeWidth={1.5} />
            <polygon points={`${x2-4},${H/2-3} ${x2},${H/2} ${x2-4},${H/2+3}`} fill="#cbd5e1" />
          </g>
        );
      })}
      {Array.from({length: count}, (_, i) => (
        <rect key={i} x={gap + i * (boxW + gap)} y={by} width={boxW} height={boxH} rx={4} fill={PALETTE[i % PALETTE.length]} />
      ))}
    </svg>
  );
}

// ── AI Thinking animation ─────────────────────────────────────────────────────
const AI_TOKENS = [
  "tokens","context","embedding","inference","neural","attention","transformer",
  "gradient","weight","latent","vector","semantic","entropy","logit","softmax",
  "decode","encode","tensor","backprop","synapse","neuron","pattern","classify",
  "predict","generate","reason","analyze","parse","query","memory","chain",
  "cluster","feature","kernel","dropout","sigmoid","relu","normalize","sample",
  "prompt","stream","output","input","layer","epoch","batch","loss","node",
  "graph","recursion",
];
const AI_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*<>/\\|{}[]";
const PARTICLE_COLORS = [
  "#f87171","#fb923c","#fbbf24","#34d399","#38bdf8","#818cf8","#e879f9",
  "#f472b6","#a3e635","#2dd4bf","#60a5fa","#c084fc",
];
function pickToken() {
  return Math.random() < 0.35
    ? AI_TOKENS[Math.floor(Math.random() * AI_TOKENS.length)]
    : AI_CHARS[Math.floor(Math.random() * AI_CHARS.length)];
}
const LOADING_PHRASES = [
  "Thinking…","Tokenizing…","Building graph…","Reasoning…","Encoding…",
  "Mapping flow…","Inferring…","Generating…","Assembling…","Almost there…",
];

function AIThinkingOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width = window.innerWidth;
    const H = canvas.height = window.innerHeight;

    const particles = Array.from({ length: 140 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      text: pickToken(),
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      alpha: Math.random() * 0.55 + 0.12,
      size: Math.floor(Math.random() * 8) + 9,
      tickNext: Math.floor(Math.random() * 50),
      isWord: Math.random() < 0.35,
    }));

    let t = 0;
    let phraseIdx = 0;
    let phraseTimer = 0;

    const draw = () => {
      t++;
      phraseTimer++;
      if (phraseTimer > 80) { phraseTimer = 0; phraseIdx = (phraseIdx + 1) % LOADING_PHRASES.length; }

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(8,8,16,0.92)";
      ctx.fillRect(0, 0, W, H);

      // breathing glow orb — center only, no label near it
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.04);
      const r = 88 * pulse;
      const grd = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r * 2.8);
      grd.addColorStop(0, `rgba(220,220,220,${0.18 * pulse})`);
      grd.addColorStop(0.5, `rgba(160,160,160,${0.08 * pulse})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r * 2.8, 0, Math.PI * 2); ctx.fill();

      const core = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
      core.addColorStop(0, `rgba(255,255,255,${0.55 * pulse})`);
      core.addColorStop(1, "rgba(180,180,180,0)");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.fill();

      // floating tokens + chars — avoid center circle
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        if (--p.tickNext <= 0) {
          p.text = pickToken();
          p.isWord = p.text.length > 1;
          p.color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
          p.tickNext = Math.floor(Math.random() * 70) + 25;
        }
        const dist = Math.hypot(p.x - W / 2, p.y - H / 2);
        if (dist < r * 1.1) continue; // skip particles inside orb
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.font = `${p.isWord ? "700" : "400"} ${p.size}px monospace`;
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;

      // rotating phrase — bottom center, clear of orb
      const phrase = LOADING_PHRASES[phraseIdx];
      ctx.font = "500 13px system-ui,sans-serif";
      ctx.fillStyle = `rgba(160,170,220,${0.75 + 0.25 * pulse})`;
      ctx.textAlign = "center";
      ctx.fillText(phrase, W / 2, H - 48);

      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 2000, display: "block" }} />;
}

// ── AI Prompt modal ────────────────────────────────────────────────────────────
function AIPromptModal({ onClose, onCreated }: { onClose: () => void; onCreated: (d: Diagram) => void }) {
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async () => {
    if (!prompt.trim() || thinking) return;
    setThinking(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Generation failed", { color: "#ef4444" }); setThinking(false); return; }
      onCreated(data);
    } catch {
      showToast("Network error", { color: "#ef4444" });
      setThinking(false);
    }
  };

  if (thinking) return <AIThinkingOverlay />;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 20, padding: "32px 32px 28px", width: 520, boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#1c1e21", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: 0 }}>Generate with AI</h3>
            <p style={{ fontSize: 12, color: "#8a8d91", margin: 0 }}>Describe your diagram and Claude will build it</p>
          </div>
        </div>
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); if (e.key === "Escape") onClose(); }}
          placeholder="e.g. OAuth 2.0 login flow between user, frontend, and auth server…"
          rows={4}
          style={{ width: "100%", padding: "12px 14px", fontSize: 14, border: "1.5px solid #e4e6e8", borderRadius: 12, outline: "none", fontFamily: "inherit", resize: "none", color: "#1c1e21", background: "#f8f9fa", boxSizing: "border-box", lineHeight: 1.6 }}
        />
        <p style={{ fontSize: 11, color: "#bcc0c4", margin: "8px 0 20px" }}>⌘ + Enter to generate</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", border: "1px solid #e4e6e8", borderRadius: 10, background: "#f4f5f7", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#65676b" }}>Cancel</button>
          <button onClick={submit} disabled={!prompt.trim()} style={{ padding: "10px 24px", background: prompt.trim() ? "#1c1e21" : "#e4e6e8", color: prompt.trim() ? "#fff" : "#8a8d91", border: "none", borderRadius: 10, cursor: prompt.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 600, fontFamily: "inherit", transition: "background 0.15s" }}>
            Generate ✦
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tag colors — 12 unique palettes, assigned by sorted position (no duplicates) ──
const TAG_PALETTE = [
  { bg: "#fef2f2", text: "#b91c1c", border: "#fca5a5" }, // red
  { bg: "#fff7ed", text: "#c2410c", border: "#fdba74" }, // orange
  { bg: "#fefce8", text: "#a16207", border: "#fde047" }, // yellow
  { bg: "#f0fdf4", text: "#15803d", border: "#86efac" }, // green
  { bg: "#ecfdf5", text: "#047857", border: "#6ee7b7" }, // emerald
  { bg: "#f0fdfa", text: "#0f766e", border: "#5eead4" }, // teal
  { bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd" }, // blue
  { bg: "#eef2ff", text: "#4338ca", border: "#a5b4fc" }, // indigo
  { bg: "#faf5ff", text: "#7e22ce", border: "#d8b4fe" }, // violet
  { bg: "#fdf4ff", text: "#a21caf", border: "#f0abfc" }, // fuchsia
  { bg: "#fff1f2", text: "#be123c", border: "#fda4af" }, // rose
  { bg: "#f0f9ff", text: "#0369a1", border: "#7dd3fc" }, // sky
];
function buildTagColorMap(tags: string[]): Map<string, typeof TAG_PALETTE[0]> {
  const map = new Map<string, typeof TAG_PALETTE[0]>();
  [...tags].sort().forEach((t, i) => map.set(t, TAG_PALETTE[i % TAG_PALETTE.length]));
  return map;
}
const FALLBACK_TAG_STYLE = { bg: "#f0f1f3", text: "#65676b", border: "#e4e6e8" };
function tagStyle(tag: string, colorMap?: Map<string, typeof TAG_PALETTE[0]>) {
  return colorMap?.get(tag) ?? TAG_PALETTE[0];
}

// ── Tag modal ─────────────────────────────────────────────────────────────────
const PRESET_TAGS = ["AI", "API", "Work", "Personal", "Research", "Pasted"];
function TagModal({ diagram, onSave, onClose, tagColorMap, allKnownTags }: { diagram: Diagram; onSave: (tags: string[]) => void; onClose: () => void; tagColorMap: Map<string, typeof TAG_PALETTE[0]>; allKnownTags: string[] }) {
  const [tags, setTags] = useState<string[]>(diagram.tags ?? []);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const add = (t: string) => { const v = t.trim(); if (!v || tags.includes(v)) return; setTags(p => [...p, v]); setInput(""); };
  const remove = (t: string) => setTags(p => p.filter(x => x !== t));

  // All selectable options: presets + any existing tags in the system
  const allOptions = [...new Set([...PRESET_TAGS, ...allKnownTags])].sort();

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}
      onKeyDown={e => { if (e.key === "Enter" && !input.trim()) { e.stopPropagation(); onSave(tags); onClose(); } }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "28px 32px 24px", width: 620, maxWidth: "90vw", boxShadow: "0 24px 64px rgba(0,0,0,0.12)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: "0 0 4px" }}>Tags</h3>
        <p style={{ fontSize: 12, color: "#8a8d91", margin: "0 0 18px" }}>{diagram.title}</p>

        {/* All tag options */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>
          {allOptions.map(t => {
            const active = tags.includes(t);
            const s = tagColorMap.get(t) ?? TAG_PALETTE[allOptions.indexOf(t) % TAG_PALETTE.length];
            return (
              <button key={t} onClick={() => active ? remove(t) : add(t)}
                style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${s.border}`, background: active ? s.bg : "#fff", color: s.text, opacity: active ? 1 : 0.55, transition: "opacity 0.12s, background 0.12s", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                {t}
              </button>
            );
          })}
        </div>

        {/* Custom tag input */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") { if (input.trim()) add(input); else { onSave(tags); onClose(); } } if (e.key === "Escape") onClose(); }}
            placeholder="Custom tag…"
            style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: "1.5px solid #e4e6e8", borderRadius: 9, outline: "none", fontFamily: "inherit", color: "#1c1e21", background: "#f8f9fa" }} />
          <button onClick={() => add(input)} style={{ padding: "8px 14px", background: "#1c1e21", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Add</button>
        </div>

        {/* Selected tags with remove */}
        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {tags.map(t => { const s = tagColorMap.get(t) ?? TAG_PALETTE[0]; return (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.text, border: `1.5px solid ${s.border}` }}>
                {t}
                <button onClick={() => remove(t)} title={`Remove ${t}`}
                  style={{ width: 16, height: 16, borderRadius: "50%", background: s.text, border: "none", cursor: "pointer", color: "#fff", fontSize: 11, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, lineHeight: 1 }}>×</button>
              </span>
            ); })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", border: "1px solid #e4e6e8", borderRadius: 9, background: "#f4f5f7", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#65676b" }}>Cancel</button>
          <button onClick={() => onSave(tags)} style={{ padding: "9px 22px", background: "#1c1e21", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Rename modal ──────────────────────────────────────────────────────────────
function RenameModal({ title, onSave, onClose }: { title: string; onSave: (t: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, padding: "28px 28px 24px", width: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: "0 0 16px" }}>Rename Diagram</h3>
        <input
          ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && val.trim()) onSave(val.trim()); if (e.key === "Escape") onClose(); }}
          placeholder="Diagram title…"
          style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: "1.5px solid #1c1e21", borderRadius: 10, outline: "none", fontFamily: "inherit", marginBottom: 16, boxSizing: "border-box", color: "#1c1e21", background: "#f4f5f7" }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", border: "1px solid #e4e6e8", borderRadius: 9, background: "#f4f5f7", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#65676b" }}>Cancel</button>
          <button onClick={() => val.trim() && onSave(val.trim())} style={{ padding: "9px 22px", background: "#1c1e21", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function DiagramCard({ d, isFav, isShared, onOpen, onToggleFav, onDelete, onShare, onRename, onTag, copied, deleting, tagColorMap }: {
  d: Diagram; isFav: boolean; isShared: boolean;
  onOpen: () => void; onToggleFav: () => void; onDelete: () => void; onShare: () => void; onRename: () => void; onTag: () => void;
  copied: boolean; deleting: boolean; tagColorMap: Map<string, typeof TAG_PALETTE[0]>;
}) {
  const [hovered, setHovered] = useState(false);
  const tags = d.tags ?? [];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      style={{
        background: "#ffffff",
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "box-shadow 0.15s, transform 0.15s",
        border: hovered ? "2px solid #1c1e21" : "2px solid transparent",
        boxShadow: hovered ? "0 8px 28px rgba(0,0,0,0.18), 0 0 0 3px rgba(28,30,33,0.08)" : "0 1px 4px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        position: "relative",
      }}
    >
      {/* Header */}
      <div style={{ padding: "13px 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1c1e21", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {d.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isShared && (
            <span title="Public" style={{ fontSize: 9, fontWeight: 600, color: "#65676b", background: "#f0f1f3", border: "1px solid #e4e6e8", borderRadius: 4, padding: "2px 6px" }}>
              Public
            </span>
          )}
          <span style={{ fontSize: 10, color: "#8a8d91" }}>{relativeTime(d.updated_at ?? d.created_at)}</span>
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ padding: "0 13px 8px", display: "flex", gap: 4, flexWrap: "wrap" }} onClick={e => { e.stopPropagation(); onTag(); }}>
          {tags.map(t => { const s = tagColorMap.get(t) ?? TAG_PALETTE[0]; return (
            <span key={t} style={{ fontSize: 6, fontWeight: 700, padding: "1px 4px", borderRadius: 20, background: s.bg, color: s.text, border: `1px solid ${s.border}`, cursor: "pointer", letterSpacing: "0.02em", lineHeight: 1.4 }}>{t}</span>
          ); })}
        </div>
      )}

      {/* Minimap */}
      <div style={{ padding: "0 12px 13px" }}>
        <DiagramMinimap code={d.code} type={d.diagram_type} />
      </div>

      {/* Hover actions */}
      {hovered && (
        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={onTag} title="Tags"
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #e4e6e8", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l7.3-7.3a1 1 0 0 0 0-1.41L12 2z"/><circle cx="7" cy="7" r="1.5" fill="#8a8d91"/>
            </svg>
          </button>
          <button onClick={onToggleFav} title={isFav ? "Unfavorite" : "Favorite"}
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #e4e6e8", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill={isFav ? "#f59e0b" : "none"} stroke={isFav ? "#f59e0b" : "#8a8d91"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <button onClick={onDelete} title="Delete" disabled={deleting}
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #e4e6e8", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", opacity: deleting ? 0.5 : 1 }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Avatar cache ──────────────────────────────────────────────────────────────
const LS_KEY = "diagrams_user_cache";

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DiagramsClient({ user, diagrams: initial, onRefresh }: { user: User; diagrams: Diagram[]; onRefresh?: () => void }) {
  const [diagrams, setDiagrams] = useState(initial);
  useEffect(() => { setDiagrams(initial); }, [initial]);

  const [favs, setFavs] = useState<Set<string>>(() => new Set(initial.filter(d => d.is_favorite).map(d => d.id)));
  useEffect(() => { setFavs(new Set(initial.filter(d => d.is_favorite).map(d => d.id))); }, [initial]);
  const [shared, setShared] = useState<Set<string>>(loadShared);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [renamingDiagram, setRenamingDiagram] = useState<Diagram | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [taggingDiagram, setTaggingDiagram] = useState<Diagram | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleAICreated = useCallback((d: Diagram) => {
    setShowAIPrompt(false);
    // Redirect straight to the diagram
    window.location.href = `/?id=${d.id}&imported=1`;
  }, []);
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "";

  useEffect(() => {
    const liveUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture;
    if (liveUrl) setAvatarSrc(liveUrl);
  }, [user]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Realtime: listen for AI-created diagrams ──────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    function playChime() {
      try {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
        [880, 1108, 1320].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = freq;
          osc.connect(gain);
          osc.start(ctx.currentTime + i * 0.07);
          osc.stop(ctx.currentTime + 1.2);
        });
      } catch {}
    }

    const channel = supabase
      .channel("ai-diagrams")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "diagrams" }, (payload: { new: Diagram }) => {
        const d = payload.new as Diagram;
        setDiagrams(prev => prev.some(x => x.id === d.id) ? prev : [d, ...prev]);
        if (d.is_favorite) setFavs(prev => new Set([...prev, d.id]));
        playChime();
        showToast(`✦ "${d.title}" created by AI`, { color: "#1c1e21" });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Global paste — save new record + open in editor ───────────────────────
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const pasted = e.clipboardData?.getData("text") ?? "";
      if (!pasted.trim()) return;
      const body = (() => { const s = pasted.trim(); const lines = s.split("\n"); if (lines[0]?.trim() !== "---") return s; const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---"); return end === -1 ? s : lines.slice(end + 1).join("\n").trimStart(); })();
      const looksLikeSequence = /^sequenceDiagram/im.test(body);
      if (!looksLikeSequence) return;
      e.preventDefault();
      showToast("Diagram detected — opening editor…", { color: "#1c1e21" });

      const titleMatch = pasted.match(/^\s*(?:title|accTitle):?\s+(.+)$/im);
      const title = titleMatch ? titleMatch[1].trim() : "Untitled";
      const typeMatch = pasted.trim().match(/^(sequenceDiagram|flowchart|graph|classDiagram|erDiagram|gantt|pie|mindmap|gitGraph|journey)/i);
      const dtype = typeMatch ? typeMatch[1].toLowerCase().replace("graph", "flowchart") : "sequence";

      let savedId: string | null = null;
      try {
        const res = await fetch("/api/diagrams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, code: pasted, diagramType: dtype, tags: ["Pasted"] }),
        });
        if (res.ok) {
          const data = await res.json();
          savedId = data?.id ?? null;
        }
      } catch { /* navigate anyway */ }

      window.location.href = savedId ? `/?id=${savedId}&imported=1` : `/?new`;
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [user]);

  async function saveTitle(id: string, newTitle: string) {
    const diagram = diagrams.find(d => d.id === id);
    // Also patch the title: line inside the code so the rendered diagram stays in sync
    const newCode = diagram?.code
      ? diagram.code.replace(/^((?:title|accTitle):[ \t]*)(.*)$/m, `$1${newTitle}`)
      : null;
    const codeChanged = newCode && newCode !== diagram?.code;
    const supabase = createClient();
    await supabase.from("diagrams").update({ title: newTitle, ...(codeChanged ? { code: newCode } : {}) }).eq("id", id);
    setDiagrams(prev => prev.map(d => d.id === id ? { ...d, title: newTitle, ...(codeChanged ? { code: newCode! } : {}) } : d));
    setRenamingDiagram(null);
  }

  function toggleFav(id: string) {
    setFavs(prev => {
      const next = new Set(prev);
      const isFav = next.has(id);
      if (isFav) next.delete(id); else next.add(id);
      createClient().from("diagrams").update({ is_favorite: !isFav }).eq("id", id).then(() => {});
      return next;
    });
  }

  async function saveTags(id: string, tags: string[]) {
    const { error } = await createClient().from("diagrams").update({ tags }).eq("id", id);
    if (error) { showToast(`Failed to save tags: ${error.message}`, { color: "#ef4444" }); return; }
    setDiagrams(prev => prev.map(d => d.id === id ? { ...d, tags } : d));
    setTaggingDiagram(null);
    showToast(tags.length ? `Tags saved: ${tags.join(", ")}` : "Tags cleared", { color: "#1c1e21" });
  }

  function signOut() {
    const farewells = ["Later!","See ya!","Peace out!","Catch you later!","Adios!","So long!","Bye for now!","Take care!","Until next time!"];
    const msg = farewells[Math.floor(Math.random() * farewells.length)];
    createClient().auth.signOut().then(() => {
      localStorage.removeItem(LS_KEY);
      showToast(msg);
      setTimeout(() => window.location.reload(), 1800);
    });
  }

  function openInEditor(d: Diagram) { window.location.href = `/?id=${d.id}`; }

  function copyShareLink(id: string) {
    const url = `${window.location.origin}/d/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(id); setTimeout(() => setCopied(null), 1500);
      setShared(prev => { const next = new Set(prev); next.add(id); localStorage.setItem(LS_SHARED, JSON.stringify([...next])); return next; });
      showToast("Public link copied!", { color: "#1c1e21" });
    });
  }

  async function deleteDiagram(id: string) {
    setConfirmDeleteId(null);
    setDeleting(id);
    const supabase = createClient();
    const { error } = await supabase.from("diagrams").delete().eq("id", id);
    if (error) {
      showToast(`Delete failed: ${error.message}`, { color: "#ef4444" });
      setDeleting(null); return;
    }
    showToast("Deleted ✓", { color: "#64748b" });
    setDiagrams(prev => prev.filter(d => d.id !== id));
    setFavs(prev => { const next = new Set(prev); next.delete(id); return next; });
    setDeleting(null);
  }

  const allTags = [...new Set(diagrams.flatMap(d => d.tags ?? []))].sort();
  const tagColorMap = useMemo(() => buildTagColorMap(allTags), [allTags.join(",")]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    diagrams.forEach(d => (d.tags ?? []).forEach(t => m.set(t, (m.get(t) ?? 0) + 1)));
    return m;
  }, [diagrams]);

  const filtered = diagrams.filter(d => {
    if (search.trim() && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.diagram_type.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTag === "__no_tag__") return (d.tags ?? []).length === 0;
    if (activeTag) return (d.tags ?? []).includes(activeTag);
    return true;
  });

  const byUpdated = (a: Diagram, b: Diagram) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at);
  const favDiagrams = filtered.filter(d => favs.has(d.id)).sort(byUpdated);
  const recentDiagrams = filtered.filter(d => !favs.has(d.id)).sort(byUpdated);

  const cardProps = (d: Diagram) => ({
    d, isFav: favs.has(d.id), isShared: shared.has(d.id),
    onOpen: () => openInEditor(d),
    onToggleFav: () => toggleFav(d.id),
    onDelete: () => setConfirmDeleteId(d.id),
    onShare: () => copyShareLink(d.id),
    onRename: () => setRenamingDiagram(d),
    onTag: () => setTaggingDiagram(d),
    copied: copied === d.id,
    deleting: deleting === d.id,
    tagColorMap,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7", fontFamily: "Inter, system-ui, sans-serif" }}>
      <CuteToast />
      <style>{`
        @media (max-width: 640px) {
          .dc-header { padding: 0 16px !important; }
          .dc-search-wrap { flex: 1 !important; width: auto !important; min-width: 0 !important; }
          .dc-search-wrap input { width: 100% !important; }
          .dc-main { padding: 20px 16px 100px !important; }
          .dc-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important; gap: 10px !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <header className="dc-header" style={{ background: "#ffffff", borderBottom: "1px solid #e4e6e8", padding: "0 32px", height: 56, display: "flex", alignItems: "center", gap: 20, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <svg width={28} height={28} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 8 }}>
            <defs><linearGradient id="hbg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#0f051e"/><stop offset="55%" stopColor="#2e0f6b"/><stop offset="100%" stopColor="#0c2340"/></linearGradient></defs>
            <rect width="512" height="512" rx="115" fill="url(#hbg)"/>
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
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1c1e21", letterSpacing: "-0.01em" }}>Diagrams</span>
        </div>

        {/* Search */}
        <div className="dc-search-wrap" style={{ position: "relative", width: 260 }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8a8d91" }} width={13} height={13} viewBox="0 0 20 20" fill="none">
            <circle cx={9} cy={9} r={6} stroke="currentColor" strokeWidth={1.8} />
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ width: "100%", padding: "7px 14px 7px 32px", boxSizing: "border-box", border: "1px solid #e4e6e8", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "inherit", color: "#1c1e21", background: "#f4f5f7" }} />
        </div>

        <div style={{ flex: 1 }} />

        {/* Avatar */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => setShowMenu(v => !v)}
            style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", border: showMenu ? "2px solid #1c1e21" : "2px solid #e4e6e8", cursor: "pointer", padding: 0, background: "#e4e6e8", transition: "border-color 0.15s", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1e21", userSelect: "none" }}>{name[0]?.toUpperCase()}</span>
            {avatarSrc && <img src={avatarSrc} alt="" referrerPolicy="no-referrer" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          </button>
          {showMenu && (
            <div style={{ position: "absolute", top: 42, right: 0, width: 210, background: "#ffffff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", border: "1px solid #e4e6e8", overflow: "hidden", zIndex: 50 }}>
              <div style={{ padding: "14px 16px 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1c1e21", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                <div style={{ fontSize: 11, color: "#8a8d91", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>{user.email}</div>
              </div>
              <div style={{ height: 1, background: "#f0f1f3" }} />
              <button onClick={() => { setShowDocs(true); setShowMenu(false); }}
                style={{ width: "100%", padding: "11px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#1c1e21", fontFamily: "inherit", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f4f5f7")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                <span style={{ fontSize: 14 }}>📋</span> Import formats
              </button>
              <div style={{ height: 1, background: "#f0f1f3" }} />
              <button onClick={signOut}
                style={{ width: "100%", padding: "11px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#dc2626", fontFamily: "inherit", fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      {/* ── Tag filter bar ── */}
      {allTags.length > 0 && (
        <div style={{ background: "#ffffff", borderBottom: "1px solid #e4e6e8", padding: "0 32px", height: 40, display: "flex", alignItems: "center", gap: 6, overflowX: "auto" }}>
          <button onClick={() => setActiveTag(null)}
            style={{ padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${!activeTag ? "#1c1e21" : "#e4e6e8"}`, background: !activeTag ? "#1c1e21" : "#f4f5f7", color: !activeTag ? "#fff" : "#65676b", flexShrink: 0, transition: "all 0.12s", display: "flex", alignItems: "center", gap: 5 }}>
            All <span style={{ background: !activeTag ? "rgba(255,255,255,0.25)" : "#e4e6e8", borderRadius: 20, padding: "0 5px", fontSize: 10 }}>{diagrams.length}</span>
          </button>
          {allTags.map(t => { const s = tagColorMap.get(t)!; const active = activeTag === t; const count = tagCounts.get(t) ?? 0; return (
            <button key={t} onClick={() => setActiveTag(active ? null : t)}
              style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${s.border}`, background: active ? s.bg : `${s.bg}99`, color: s.text, flexShrink: 0, transition: "all 0.12s", opacity: active ? 1 : 0.6, display: "flex", alignItems: "center", gap: 5 }}>
              {t} <span style={{ background: `${s.text}22`, borderRadius: 20, padding: "0 5px", fontSize: 10 }}>{count}</span>
            </button>
          ); })}
          <button onClick={() => setActiveTag(activeTag === "__no_tag__" ? null : "__no_tag__")}
            style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${activeTag === "__no_tag__" ? "#8a8d91" : "#e4e6e8"}`, background: activeTag === "__no_tag__" ? "#f0f1f3" : "#f4f5f7", color: "#65676b", flexShrink: 0, transition: "all 0.12s", display: "flex", alignItems: "center", gap: 5 }}>
            No Tag <span style={{ background: "#e4e6e8", borderRadius: 20, padding: "0 5px", fontSize: 10 }}>{diagrams.filter(d => (d.tags ?? []).length === 0).length}</span>
          </button>
        </div>
      )}

      {/* ── Content ── */}
      <main className="dc-main" style={{ padding: "32px 32px 100px", maxWidth: 1600, margin: "0 auto" }}>

        {filtered.length === 0 && (
          <div style={{ position: "fixed", inset: 0, top: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", background: "#f4f5f7" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#e4e6e8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
            </div>
            <p style={{ fontSize: 14, color: "#1c1e21", fontWeight: 600, margin: 0 }}>{search ? "No diagrams found" : "No diagrams yet"}</p>
            <p style={{ fontSize: 13, color: "#8a8d91", marginTop: 6 }}>{search ? "Try a different search" : "Paste diagram code to get started"}</p>
          </div>
        )}

        {/* Favorites */}
        {favDiagrams.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8d91", textTransform: "uppercase", letterSpacing: "0.08em" }}>Favorites</span>
              <span style={{ fontSize: 11, color: "#bcc0c4", fontWeight: 500 }}>{favDiagrams.length}</span>
            </div>
            <div className="dc-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {favDiagrams.map(d => <DiagramCard key={d.id} {...cardProps(d)} />)}
            </div>
          </section>
        )}

        {/* All / Recent */}
        {recentDiagrams.length > 0 && (
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8d91", textTransform: "uppercase", letterSpacing: "0.08em" }}>{favDiagrams.length > 0 ? "Recent" : "All Diagrams"}</span>
              <span style={{ fontSize: 11, color: "#bcc0c4", fontWeight: 500 }}>{recentDiagrams.length}</span>
            </div>
            <div className="dc-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {recentDiagrams.map(d => <DiagramCard key={d.id} {...cardProps(d)} />)}
            </div>
          </section>
        )}
      </main>

      {/* ── FAB ── */}
      <button onClick={() => setShowAIPrompt(true)} title="Generate with AI"
        style={{ position: "fixed", bottom: 32, right: 32, width: 52, height: 52, borderRadius: "50%", background: "#1c1e21", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", border: "none", cursor: "pointer", fontSize: 24, color: "#fff", transition: "transform 0.15s, box-shadow 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(0,0,0,0.4)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)"; }}
      >✦</button>

      {showAIPrompt && <AIPromptModal onClose={() => setShowAIPrompt(false)} onCreated={handleAICreated} />}
      {taggingDiagram && <TagModal diagram={taggingDiagram} onSave={tags => saveTags(taggingDiagram.id, tags)} onClose={() => setTaggingDiagram(null)} tagColorMap={tagColorMap} allKnownTags={allTags} />}

      {renamingDiagram && (
        <RenameModal
          title={renamingDiagram.title}
          onSave={t => saveTitle(renamingDiagram.id, t)}
          onClose={() => setRenamingDiagram(null)}
        />
      )}

      {confirmDeleteId && (
        <div onClick={() => setConfirmDeleteId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, padding: "28px 28px 24px", width: 380, boxShadow: "0 24px 64px rgba(0,0,0,0.12)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: "0 0 8px" }}>Delete diagram?</h3>
            <p style={{ fontSize: 13, color: "#65676b", margin: "0 0 24px", lineHeight: 1.5 }}>This can't be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDeleteId(null)} style={{ padding: "9px 18px", border: "1px solid #e4e6e8", borderRadius: 9, background: "#f4f5f7", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#65676b" }}>Cancel</button>
              <button onClick={() => deleteDiagram(confirmDeleteId)} style={{ padding: "9px 22px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showDocs && (
        <div onClick={() => setShowDocs(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, padding: "28px 32px", width: 560, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: 0 }}>Import Formats</h2>
              <button onClick={() => setShowDocs(false)} style={{ background: "none", border: "none", color: "#8a8d91", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "#65676b", margin: "0 0 20px", lineHeight: 1.6 }}>Paste any of these directly on the page or into the code editor. Sequence diagrams auto-save; use <kbd style={{ background: "#f4f5f7", border: "1px solid #e4e6e8", borderRadius: 4, padding: "1px 6px", fontSize: 11, color: "#1c1e21" }}>⌘S</kbd> to save edits.</p>
            {[
              { label: "Mermaid Sequence Diagram", tag: "Auto-saves on paste", tagColor: "#16a34a", code: `sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello!\n  B-->>A: Hi there` },
              { label: "Arrow types", tag: "Syntax", tagColor: "#65676b", code: `A->B: solid line, no arrow\nA->>B: solid line, arrowhead\nA-->B: dashed, no arrow\nA-->>B: dashed, arrowhead` },
              { label: "With title & autonumber", tag: "Optional", tagColor: "#65676b", code: `sequenceDiagram\n  title: My API Flow\n  autonumber\n  Client->>Server: POST /login\n  Server-->>Client: 200 OK` },
              { label: "Markdown fenced block", tag: "Also accepted", tagColor: "#65676b", code: `\`\`\`mermaid\nsequenceDiagram\n  A->>B: works too\n\`\`\`` },
            ].map(({ label, tag, tagColor, code }) => (
              <div key={label} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1c1e21" }}>{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: tagColor, background: `${tagColor}14`, borderRadius: 4, padding: "2px 7px" }}>{tag}</span>
                </div>
                <pre style={{ margin: 0, padding: "12px 14px", background: "#f4f5f7", borderRadius: 8, border: "1px solid #e4e6e8", fontSize: 11, color: "#1c1e21", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre" }}>{code}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}
