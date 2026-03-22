"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/app/CuteToast";
import type { User } from "@supabase/supabase-js";

type Diagram = {
  id: string; title: string; slug: string;
  diagram_type: string; created_at: string; updated_at: string; code: string;
};

// ── Favorites ─────────────────────────────────────────────────────────────────
const LS_FAVS = "diagrams:favorites";
function loadFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_FAVS) ?? "[]")); } catch { return new Set(); }
}
function saveFavs(favs: Set<string>) { localStorage.setItem(LS_FAVS, JSON.stringify([...favs])); }

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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
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
  const svgStyle: React.CSSProperties = { display: "block", background: "#1a1b2e", borderRadius: 8 };

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
              <line x1={x} y1={LIFE_TOP} x2={x} y2={LIFE_MID - r} stroke={colors[i]} strokeWidth={0.8} opacity={0.35} />
              <line x1={x} y1={LIFE_MID + r} x2={x} y2={LIFE_BOT} stroke={colors[i]} strokeWidth={0.8} opacity={0.35} />
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
              <circle cx={x} cy={LIFE_MID} r={r} fill={colors[i]} fillOpacity={0.15} stroke={colors[i]} strokeWidth={0.6} strokeOpacity={0.5} />
              <text x={x} y={LIFE_MID + numSize * 0.35} textAnchor="middle" fill={colors[i]} fontSize={numSize} fontWeight="700" fontFamily="system-ui,sans-serif" opacity={0.9}>{i + 1}</text>
            </g>
          );
        })}
        {/* arrows */}
        {msgs.slice(0, maxM).map((msg, idx) => {
          const y = LIFE_TOP + 4 + idx * msgGap + msgGap / 2;
          const x1 = xs[msg.fi], x2 = xs[msg.ti];
          const dir = x2 > x1 ? 1 : -1;
          const tip = 3;
          return (
            <g key={`m${idx}`}>
              <line x1={x1} y1={y} x2={x2 - dir * tip} y2={y} stroke="rgba(255,255,255,0.25)" strokeWidth={arrowW} />
              <polygon points={`${x2 - dir * tip},${y - 2} ${x2},${y} ${x2 - dir * tip},${y + 2}`} fill="rgba(255,255,255,0.25)" />
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

// ── Rename modal ──────────────────────────────────────────────────────────────
function RenameModal({ title, onSave, onClose }: { title: string; onSave: (t: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1a1b30", borderRadius: 16, padding: 24, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.2)", border: "1px solid #2a2b45" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e8eaf8", margin: "0 0 16px" }}>Rename Diagram</h3>
        <input
          ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && val.trim()) onSave(val.trim()); if (e.key === "Escape") onClose(); }}
          placeholder="Diagram title…"
          style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: "1.5px solid #7c3aed", borderRadius: 10, outline: "none", fontFamily: "inherit", marginBottom: 16, boxSizing: "border-box", color: "#e8eaf8", background: "#13142a" }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #2e2f4a", borderRadius: 9, background: "#252640", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#9ca0c0" }}>Cancel</button>
          <button onClick={() => val.trim() && onSave(val.trim())} style={{ padding: "8px 20px", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function DiagramCard({ d, isFav, isShared, onOpen, onToggleFav, onDelete, onShare, onRename, copied, deleting }: {
  d: Diagram; isFav: boolean; isShared: boolean;
  onOpen: () => void; onToggleFav: () => void; onDelete: () => void; onShare: () => void; onRename: () => void;
  copied: boolean; deleting: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      style={{
        background: "linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 40%, #1a1b30 100%)",
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "box-shadow 0.18s, transform 0.15s, border-color 0.18s",
        border: hovered ? "1px solid rgba(124,58,237,0.5)" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: hovered
          ? "0 0 0 1px rgba(124,58,237,0.2), 0 8px 32px rgba(124,58,237,0.18), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)"
          : "0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        position: "relative",
      }}
    >
      {/* Header */}
      <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#dde0f5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {d.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isShared && (
            <span title="Public — anyone with the link can view" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#a78bfa", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 6, padding: "1px 5px" }}>
              <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Public
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#4a4d6e" }}>
            <svg width={10} height={10} viewBox="0 0 20 20" fill="none">
              <circle cx={10} cy={10} r={7} stroke="currentColor" strokeWidth={1.8} />
              <path d="M10 7v3.5l2 2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
            </svg>
            {relativeTime(d.updated_at ?? d.created_at)}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#23243c", margin: "0 14px" }} />

      {/* Minimap */}
      <div style={{ padding: "6px 12px 10px" }}>
        <DiagramMinimap code={d.code} type={d.diagram_type} />
      </div>

      {/* Hover actions */}
      {hovered && (
        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={onToggleFav} title={isFav ? "Unfavorite" : "Favorite"}
            style={{ width: 26, height: 26, borderRadius: 7, border: isFav ? "1px solid rgba(234,179,8,0.4)" : "1px solid #2e2f4a", background: "rgba(20,21,40,0.9)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill={isFav ? "#eab308" : "none"} stroke={isFav ? "#eab308" : "#5a5c7a"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <button onClick={onRename} title="Rename"
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #2e2f4a", background: "rgba(20,21,40,0.9)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#8b8fa8" strokeWidth={2} strokeLinecap="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button onClick={onShare} title="Copy share link"
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #2e2f4a", background: "rgba(20,21,40,0.9)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)", color: copied ? "#34d399" : "#8b8fa8" }}>
            {copied ? <span style={{ fontSize: 10, fontWeight: 700 }}>✓</span> : (
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1={12} y1={2} x2={12} y2={15}/>
              </svg>
            )}
          </button>
          <button onClick={onDelete} title="Delete" disabled={deleting}
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(20,21,40,0.9)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={2} strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
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

  const [favs, setFavs] = useState<Set<string>>(loadFavs);
  const [shared, setShared] = useState<Set<string>>(loadShared);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [renamingDiagram, setRenamingDiagram] = useState<Diagram | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

  // ── Global paste — save new record + open in editor ───────────────────────
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const pasted = e.clipboardData?.getData("text") ?? "";
      if (!pasted.trim()) return;
      const body = (() => { const s = pasted.trim(); const lines = s.split("\n"); if (lines[0]?.trim() !== "---") return s; const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---"); return end === -1 ? s : lines.slice(end + 1).join("\n").trimStart(); })();
      const looksLikeSequence = /^sequenceDiagram/im.test(body);
      if (!looksLikeSequence) return;
      e.preventDefault();
      showToast("Diagram detected — opening editor…", { color: "#7c3aed" });

      const titleMatch = pasted.match(/^\s*(?:title|accTitle):?\s+(.+)$/im);
      const title = titleMatch ? titleMatch[1].trim() : "Untitled";
      const typeMatch = pasted.trim().match(/^(sequenceDiagram|flowchart|graph|classDiagram|erDiagram|gantt|pie|mindmap|gitGraph|journey)/i);
      const dtype = typeMatch ? typeMatch[1].toLowerCase().replace("graph", "flowchart") : "sequence";

      let savedId: string | null = null;
      try {
        const res = await fetch("/api/diagrams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, code: pasted, diagramType: dtype }),
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
      if (next.has(id)) next.delete(id); else next.add(id);
      saveFavs(next); return next;
    });
  }

  function signOut() {
    const farewells = ["Later!","See ya!","Peace out!","Catch you later!","Adios!","So long!","Bye for now!","Take care!","Until next time!"];
    const msg = farewells[Math.floor(Math.random() * farewells.length)];
    createClient().auth.signOut().then(() => {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_FAVS);
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
      showToast("Public link copied!", { color: "#7c3aed" });
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
    setFavs(prev => { const next = new Set(prev); next.delete(id); saveFavs(next); return next; });
    setDeleting(null);
  }

  const filtered = search.trim()
    ? diagrams.filter(d => d.title.toLowerCase().includes(search.toLowerCase()) || d.diagram_type.toLowerCase().includes(search.toLowerCase()))
    : diagrams;

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
    copied: copied === d.id,
    deleting: deleting === d.id,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0f1022", fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        @media (max-width: 640px) {
          .dc-header { padding: 0 12px !important; gap: 10px !important; }
          .dc-search-wrap { flex: 1 !important; width: auto !important; min-width: 0 !important; }
          .dc-search-wrap input { width: 100% !important; }
          .dc-main { padding: 18px 12px 100px !important; }
          .dc-fav-card { width: calc(75vw) !important; min-width: 200px !important; }
          .dc-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) !important; gap: 10px !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <header className="dc-header" style={{ background: "#151628", borderBottom: "1px solid #2a2b45", padding: "0 24px", height: 52, display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
          <svg width={30} height={30} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 9 }}>
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
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e8eaf8" }}>Diagrams</span>
        </div>

        {/* Search */}
        <div className="dc-search-wrap" style={{ position: "relative", width: 240 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} width={13} height={13} viewBox="0 0 20 20" fill="none">
            <circle cx={9} cy={9} r={6} stroke="currentColor" strokeWidth={1.8} />
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search diagrams…"
            style={{ width: "100%", padding: "6px 12px 6px 30px", boxSizing: "border-box", border: "1px solid #2a2b45", borderRadius: 20, fontSize: 13, outline: "none", fontFamily: "inherit", color: "#c8cadf", background: "#1e1f35" }} />
        </div>

        <div style={{ flex: 1 }} />

        {/* Avatar */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => setShowMenu(v => !v)}
            style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", border: showMenu ? "2px solid #7c3aed" : "2px solid transparent", cursor: "pointer", padding: 0, background: "#e0e7ff", transition: "border-color 0.15s", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", userSelect: "none" }}>{name[0]?.toUpperCase()}</span>
            {avatarSrc && <img src={avatarSrc} alt="" referrerPolicy="no-referrer" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          </button>
          {showMenu && (
            <div style={{ position: "absolute", top: 40, right: 0, width: 200, background: "#1e1f35", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.2)", border: "1px solid #2a2b45", overflow: "hidden", zIndex: 50 }}>
              <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #2a2b45" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e8eaf8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                <div style={{ fontSize: 11, color: "#5a5c7a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{user.email}</div>
              </div>
              <a href="/?new" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", fontSize: 13, color: "#c8cadf", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#252640")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>✏️ Open Editor</a>
              <button onClick={signOut}
                style={{ width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", borderTop: "1px solid #2a2b45", cursor: "pointer", fontSize: 13, color: "#f87171", fontFamily: "inherit", fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.background = "#2a1a1a")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="dc-main" style={{ padding: "28px 24px 80px" }}>

        {filtered.length === 0 && (
          <div style={{ position: "fixed", inset: 0, top: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", background: "#0f1022" }}>
            <svg width={40} height={40} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 10, opacity: 0.25, marginBottom: 10 }}>
              <defs><linearGradient id="ebg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#0f051e"/><stop offset="55%" stopColor="#2e0f6b"/><stop offset="100%" stopColor="#0c2340"/></linearGradient></defs>
              <rect width="512" height="512" rx="115" fill="url(#ebg)"/>
              <rect x="48"  y="80" width="130" height="72" rx="16" fill="#fb7185"/>
              <rect x="191" y="80" width="130" height="72" rx="16" fill="#a78bfa"/>
              <rect x="334" y="80" width="130" height="72" rx="16" fill="#34d399"/>
              <line x1="125" y1="210" x2="242" y2="210" stroke="#fbbf24" strokeWidth="14" strokeLinecap="round"/>
              <polygon points="268,210 240,196 240,224" fill="#fbbf24"/>
              <line x1="268" y1="290" x2="385" y2="290" stroke="#38bdf8" strokeWidth="14" strokeLinecap="round"/>
              <polygon points="411,290 383,276 383,304" fill="#38bdf8"/>
            </svg>
            <p style={{ fontSize: 14, color: "#4a4d6e", fontWeight: 600, margin: 0 }}>{search ? "No diagrams found" : "No diagrams yet"}</p>
            <p style={{ fontSize: 12, color: "#32344e", marginTop: 4 }}>{search ? "Try a different search" : "Paste diagram code to get started"}</p>
          </div>
        )}

        {/* Favorites — horizontal scroll */}
        {favDiagrams.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, color: "#4a4d6e", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, display: "flex", alignItems: "center", gap: 5 }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Favorites · {favDiagrams.length}
            </h2>
            <div style={{ display: "flex", gap: 14, overflowX: "auto", overflowY: "visible", paddingBottom: 10, paddingTop: 2, scrollbarWidth: "none" }}>
              {favDiagrams.map(d => (
                <div key={d.id} className="dc-fav-card" style={{ flexShrink: 0, width: 260 }}>
                  <DiagramCard {...cardProps(d)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent — 5-column grid */}
        {recentDiagrams.length > 0 && (
          <section>
            <h2 style={{ fontSize: 11, fontWeight: 700, color: "#4a4d6e", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
              {favDiagrams.length > 0 ? "Recent" : "All Diagrams"} · {recentDiagrams.length}
            </h2>
            <div className="dc-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {recentDiagrams.map(d => <DiagramCard key={d.id} {...cardProps(d)} />)}
            </div>
          </section>
        )}
      </main>

      {/* ── FAB ── */}
      <a href="/?new" title="New diagram"
        style={{ position: "fixed", bottom: 28, right: 28, width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#6d28d9,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 1px rgba(139,92,246,0.4), 0 4px 24px rgba(109,40,217,0.55)", textDecoration: "none", fontSize: 26, color: "#fff" }}
      >+</a>

      {renamingDiagram && (
        <RenameModal
          title={renamingDiagram.title}
          onSave={t => saveTitle(renamingDiagram.id, t)}
          onClose={() => setRenamingDiagram(null)}
        />
      )}

      {confirmDeleteId && (
        <div onClick={() => setConfirmDeleteId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#1a1b30", borderRadius: 16, padding: 24, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.2)", border: "1px solid #2a2b45" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e8eaf8", margin: "0 0 8px" }}>Delete diagram?</h3>
            <p style={{ fontSize: 13, color: "#5a5c7a", margin: "0 0 20px" }}>This can't be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDeleteId(null)} style={{ padding: "8px 16px", border: "1px solid #2e2f4a", borderRadius: 9, background: "#252640", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#9ca0c0" }}>Cancel</button>
              <button onClick={() => deleteDiagram(confirmDeleteId)} style={{ padding: "8px 20px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}
