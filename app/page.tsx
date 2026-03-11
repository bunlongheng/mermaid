"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Code2, SlidersHorizontal, X } from "lucide-react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import { QRCodeSVG } from "qrcode.react";
import LZString from "lz-string";

// ── Mermaid Prism grammar ──────────────────────────────────────────────────────
Prism.languages.mermaid = {
    comment:  { pattern: /%%.*/, greedy: true },
    title:    { pattern: /^title:.+/m, inside: { keyword: /^title:/, string: /.+/ } },
    keyword:  /\b(sequenceDiagram|participant|actor|as|autonumber|loop|alt|else|end|opt|par|and|critical|break|rect|Note|over|left of|right of|activate|deactivate|graph|flowchart|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|gitGraph|subgraph)\b/,
    arrow:    /-->>|->>|-->|->|==>/,
    label:    { pattern: /:.+/, inside: { punctuation: /:/, string: /.+/ } },
    number:   /\b\d+\b/,
    operator: /[|{}[\]()]/,
};

function highlight(code: string) {
    return Prism.highlight(code, Prism.languages.mermaid, "mermaid");
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Participant { id: string; label: string; color: string }
type Arrow = "solid" | "dashed";
interface SeqMsg { from: string; to: string; text: string; arrow: Arrow; step: number; displayStep?: number }
interface Diagram { participants: Participant[]; messages: SeqMsg[]; title?: string }
interface Opts { coloredLines: boolean; coloredNumbers: boolean; coloredText: boolean; font: string; lifelineDash: string; theme: string; showIcons: boolean; icons: Record<string,string>; boxOverlay: string; autoLayout: boolean }
interface Layout { stepHeight: number; boxWidth: number; spacing: number; textSize: number; margin: number; vPad: number }

const DEFAULT_OPTS: Opts = { coloredLines: true, coloredNumbers: true, coloredText: true, font: "Roboto", lifelineDash: "solid", theme: "light", showIcons: false, icons: {}, boxOverlay: "none", autoLayout: true };
const DEFAULT_LAYOUT: Layout = { stepHeight: 42, boxWidth: 141, spacing: 250, textSize: 13, margin: 120, vPad: 44 };

// ── Palette ───────────────────────────────────────────────────────────────────
const PAL = ["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#f43f5e","#84cc16","#0891b2"];
const PAL_MONOKAI = ["#ab9df2","#78dce8","#a9dc76","#ffd866","#fc9867","#f92672","#ff6da2","#23bbad","#25d9c8","#c678dd"];

// ── Icon system (Lucide-sourced SVG paths, white stroke) ──────────────────────
type INode = [string, Record<string, string | number>];
const ICON_NODES: Record<string, INode[]> = {
    user:         [["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{cx:12,cy:7,r:4}]],
    bot:          [["path",{d:"M12 8V4H8"}],["rect",{width:16,height:12,x:4,y:8,rx:2}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]],
    server:       [["rect",{width:20,height:8,x:2,y:2,rx:2}],["rect",{width:20,height:8,x:2,y:14,rx:2}],["path",{d:"M6 6h.01"}],["path",{d:"M6 18h.01"}]],
    database:     [["ellipse",{cx:12,cy:5,rx:9,ry:3}],["path",{d:"M3 5V19A9 3 0 0 0 21 19V5"}],["path",{d:"M3 12A9 3 0 0 0 21 12"}]],
    zap:          [["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"}]],
    plug:         [["path",{d:"M12 22v-5"}],["path",{d:"M15 8V2"}],["path",{d:"M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"}],["path",{d:"M9 8V2"}]],
    "git-branch": [["path",{d:"M15 6a9 9 0 0 0-9 9V3"}],["circle",{cx:18,cy:6,r:3}],["circle",{cx:6,cy:18,r:3}]],
    globe:        [["circle",{cx:12,cy:12,r:10}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"}],["path",{d:"M2 12h20"}]],
    brain:        [["path",{d:"M12 18V5"}],["path",{d:"M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"}],["path",{d:"M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"}],["path",{d:"M18 18a4 4 0 0 0 2-7.464"}],["path",{d:"M6 18a4 4 0 0 1-2-7.464"}]],
    settings:     [["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"}],["circle",{cx:12,cy:12,r:3}]],
    folder:       [["path",{d:"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"}]],
    cloud:        [["path",{d:"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"}]],
    mail:         [["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"}],["rect",{x:2,y:4,width:20,height:16,rx:2}]],
    lock:         [["rect",{width:18,height:11,x:3,y:11,rx:2}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4"}]],
    key:          [["path",{d:"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"}],["path",{d:"m21 2-9.6 9.6"}],["circle",{cx:7.5,cy:15.5,r:5.5}]],
    search:       [["path",{d:"m21 21-4.34-4.34"}],["circle",{cx:11,cy:11,r:8}]],
    "chart-bar":  [["path",{d:"M3 3v16a2 2 0 0 0 2 2h16"}],["path",{d:"M7 16h8"}],["path",{d:"M7 11h12"}],["path",{d:"M7 6h3"}]],
    bell:         [["path",{d:"M10.268 21a2 2 0 0 0 3.464 0"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"}]],
    "credit-card":[["rect",{width:20,height:14,x:2,y:5,rx:2}],["path",{d:"M2 10h20"}]],
    smartphone:   [["rect",{width:14,height:20,x:5,y:2,rx:2}],["path",{d:"M12 18h.01"}]],
    rocket:       [["path",{d:"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"}],["path",{d:"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"}],["path",{d:"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"}]],
    "test-tube":  [["path",{d:"M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2"}],["path",{d:"M8.5 2h7"}],["path",{d:"M14.5 16h-5"}]],
    package:      [["path",{d:"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"}],["path",{d:"M12 22V12"}],["path",{d:"M3.29 7 12 12 20.71 7"}]],
};
const ICON_KEYS = Object.keys(ICON_NODES);

function guessIconKey(s: string): string {
    const l = s.toLowerCase();
    if (/user|client|person|human|customer|visitor|me/.test(l))            return "user";
    if (/agent|agt|bot|ai|robot|llm|gpt|claude|assistant/.test(l))         return "bot";
    if (/api|server|backend|svc|service|micro|http/.test(l))               return "server";
    if (/db|database|sql|postgres|mysql|mongo|dynamo|data/.test(l))        return "database";
    if (/cache|redis|memcache/.test(l))                                     return "zap";
    if (/mcp|plugin|webhook|hook|connector/.test(l))                        return "plug";
    if (/git|github|gitlab|repo|version|commit/.test(l))                    return "git-branch";
    if (/web|browser|frontend|ui|react|next|html/.test(l))                  return "globe";
    if (/mem|memory|context|knowledge/.test(l))                             return "brain";
    if (/sh|shell|bash|terminal|cmd|cli|exec/.test(l))                      return "settings";
    if (/file|fs|storage|disk|s3|blob|drive/.test(l))                       return "folder";
    if (/cloud|aws|azure|gcp|infra|deploy/.test(l))                         return "cloud";
    if (/queue|msg|kafka|rabbit|sqs|pubsub|bus/.test(l))                    return "mail";
    if (/auth|security|oauth|jwt|sso|iam|secret/.test(l))                   return "lock";
    if (/key/.test(l))                                                       return "key";
    if (/search|elastic|algolia|query/.test(l))                             return "search";
    if (/log|monitor|metric|grafana|datadog|obs/.test(l))                   return "chart-bar";
    if (/email|mail|smtp|send/.test(l))                                     return "mail";
    if (/pay|stripe|billing|invoice|wallet/.test(l))                        return "credit-card";
    if (/mobile|app|ios|android|phone/.test(l))                             return "smartphone";
    if (/ci|cd|pipeline|build|vercel|netlify|action/.test(l))               return "rocket";
    if (/test|spec|qa|lint|check/.test(l))                                  return "test-tube";
    if (/notification|alert|notify|push/.test(l))                           return "bell";
    return "package";
}

function renderIcon(key: string, icx: number, icy: number, size: number, color = "white"): string {
    const nodes = ICON_NODES[key] ?? ICON_NODES.package;
    const s = size / 24;
    const tx = (icx - size / 2).toFixed(1);
    const ty = (icy - size / 2).toFixed(1);
    const sw = (1.8 / s).toFixed(2);
    const elems = nodes.map(([tag, props]) => {
        const attrs = Object.entries(props).map(([k, v]) => `${k}="${v}"`).join(" ");
        return `<${tag} ${attrs}/>`;
    }).join("");
    return `<g transform="translate(${tx},${ty}) scale(${s.toFixed(4)})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${elems}</g>`;
}

// ── Diagram type detection ────────────────────────────────────────────────────
const MERMAID_TYPES: Record<string, string> = {
    sequencediagram: "sequence",
    graph:           "flowchart",
    flowchart:       "flowchart",
    classdiagram:    "class",
    erdiagram:       "er",
    statediagram:    "state",
    "statediagram-v2": "state",
    gantt:           "gantt",
    pie:             "pie",
    journey:         "journey",
    gitgraph:        "git",
    "gitgraph:":     "git",
    mindmap:         "mindmap",
    timeline:        "timeline",
    quadrantchart:   "quadrant",
    xychart:         "xychart",
    "xychart-beta":  "xychart",
    requirementdiagram: "requirement",
    "c4context":     "c4",
};

function stripFrontmatter(code: string): string {
    const lines = code.trim().split("\n");
    if (lines[0]?.trim() !== "---") return code;
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end === -1) return code;
    return lines.slice(end + 1).join("\n").trimStart();
}

function detectDiagramType(code: string): string {
    const stripped = stripFrontmatter(code);
    // Find first non-empty, non-comment, non-title line
    for (const raw of stripped.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("%%") || /^title\s*:/i.test(line) || /^accTitle\s*:/i.test(line) || /^accDescr\s*:/i.test(line)) continue;
        const key = line.toLowerCase().replace(/\s+.*$/, "");
        return MERMAID_TYPES[key] ?? "sequence";
    }
    return "sequence";
}

// ── Colorful post-processor for mermaid SVG ───────────────────────────────────
const NODE_SELECTOR_MAP: Record<string, string> = {
    flowchart: ".node",
    class:     ".classGroup",
    er:        "", // handled separately below
    state:     ".node",
    gantt:     ".task",
    pie:       ".slice",
    git:       ".commit-bullet",
    mindmap:   ".mindmap-node",
    timeline:  ".timeline-event",
    quadrant:  ".quadrant-point",
};

function applyColorfulMermaidStyle(svgString: string, opts: Opts, diagramType: string): string {
    if (typeof window === "undefined") return svgString;
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return svgString;

    const th = THEMES[opts.theme] ?? THEMES.light;
    const f = `'Inter', sans-serif`;

    // ── Strip mermaid's injected <style> — it uses CSS rules that override
    //    presentation attributes and would lock everything to primaryColor ──
    doc.querySelectorAll("style").forEach(s => s.remove());

    // ── Background ─────────────────────────────────────────────────────────
    const rootBg = svgEl.querySelector(":scope > rect");
    if (rootBg) {
        (rootBg as SVGElement).style.fill = th.bg;
    } else {
        const bgRect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
        bgRect.setAttribute("x", "0"); bgRect.setAttribute("y", "0");
        bgRect.setAttribute("width", "100%"); bgRect.setAttribute("height", "100%");
        bgRect.style.fill = th.bg;
        svgEl.insertBefore(bgRect, svgEl.firstChild);
    }

    // ── CSS for foreignObject HTML content (inline styles can't reach inside) ─
    const styleEl = doc.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = `
        .node foreignObject div, .node foreignObject span, .node foreignObject p,
        .node .nodeLabel, .node .label div, .node .label p, .node .label span,
        .classGroup foreignObject div, .classGroup foreignObject span {
            color: #ffffff !important;
            font-weight: 700 !important;
            font-family: ${f} !important;
        }
        .edgeLabel foreignObject div, .edgeLabel .label {
            color: ${th.plainTextFill} !important;
            background: transparent !important;
            font-family: ${f} !important;
        }
        .er.entityLabel, .entityLabel { dominant-baseline: middle; }
        .er.attributeType, .er.attributeName, .er.attributeKeyType { dominant-baseline: middle; }
    `;
    svgEl.insertBefore(styleEl, svgEl.firstChild);

    // ── Color each node (inline style beats any CSS rule) ──────────────────
    const nodeSelector = NODE_SELECTOR_MAP[diagramType] ?? ".node";
    const nodes = nodeSelector ? Array.from(doc.querySelectorAll(nodeSelector)) : [];
    nodes.forEach((node, i) => {
        const color = PAL[i % PAL.length];

        node.querySelectorAll("rect").forEach(el => {
            const r = el as SVGElement;
            r.style.fill = color;
            r.style.stroke = "none";
            r.setAttribute("rx", "8"); r.setAttribute("ry", "8");
        });
        node.querySelectorAll("polygon").forEach(el => {
            const p = el as SVGElement;
            p.style.fill = color; p.style.stroke = "none";
        });
        node.querySelectorAll("circle, ellipse").forEach(el => {
            const c = el as SVGElement;
            c.style.fill = color; c.style.stroke = "none";
        });
        node.querySelectorAll("path.basic, path.label-container, path.outer").forEach(el => {
            const p = el as SVGElement;
            p.style.fill = color; p.style.stroke = "none";
        });
        node.querySelectorAll("text").forEach(el => {
            const t = el as SVGElement;
            t.style.fill = "#ffffff";
            t.style.fontWeight = "700";
            t.style.fontFamily = f;
        });
    });

    // ── ER diagram ─────────────────────────────────────────────────────────
    if (diagramType === "er") {
        const pal = opts.theme === "monokai" ? PAL_MONOKAI : PAL;
        const isDark = opts.theme !== "light";
        const rowBg = isDark ? (opts.theme === "monokai" ? "#3a383d" : "#1e2030") : "#f8fafc";
        const rowBgAlt = isDark ? (opts.theme === "monokai" ? "#332f38" : "#181926") : "#f1f5f9";
        const rowBorder = isDark ? "rgba(255,255,255,0.07)" : "#e2e8f0";
        const textColor = isDark ? "#e2e8f0" : "#1e293b";
        const subtleText = isDark ? "#94a3b8" : "#64748b";

        // Color each entity header a different palette color
        const entityGroups = Array.from(doc.querySelectorAll("g.er.entityGroup, g[id^='entity-']"));
        const entityColorMap = new Map<string, string>();
        entityGroups.forEach((g, i) => {
            const color = pal[i % pal.length];
            entityColorMap.set(g.id, color);
            g.querySelectorAll("rect.er.entityBox, .entityBox").forEach(el => {
                const r = el as SVGElement;
                r.style.fill = color; r.style.stroke = "none";
                r.setAttribute("rx", "6"); r.setAttribute("ry", "6");
            });
            g.querySelectorAll("text.er.entityLabel, .entityLabel").forEach(el => {
                const t = el as SVGElement;
                t.style.fill = "#221F22"; t.style.fontWeight = "800";
                t.style.fontFamily = f; t.style.fontSize = "13px";
            });
        });

        // Style attribute rows
        Array.from(doc.querySelectorAll("g.er.attributeGroup, g[id^='attr-']")).forEach((g, i) => {
            g.querySelectorAll("rect.er.attributeBoxOdd").forEach(el => {
                const r = el as SVGElement;
                r.style.fill = rowBg; r.style.stroke = rowBorder;
            });
            g.querySelectorAll("rect.er.attributeBoxEven").forEach(el => {
                const r = el as SVGElement;
                r.style.fill = rowBgAlt; r.style.stroke = rowBorder;
            });
            g.querySelectorAll("text.er.attributeType, .attributeType").forEach(el => {
                const t = el as SVGElement;
                t.style.fill = subtleText; t.style.fontFamily = f; t.style.fontSize = "11px";
            });
            g.querySelectorAll("text.er.attributeName, .attributeName").forEach(el => {
                const t = el as SVGElement;
                t.style.fill = textColor; t.style.fontFamily = f; t.style.fontWeight = "500";
            });
            // PK → gold, FK → teal
            g.querySelectorAll("text.er.attributeKeyType, .attributeKeyType").forEach(el => {
                const t = el as SVGElement;
                const val = t.textContent?.trim().toUpperCase() ?? "";
                t.style.fill = val === "PK" ? "#FFD866" : val === "FK" ? "#78DCE8" : subtleText;
                t.style.fontWeight = "700"; t.style.fontFamily = f; t.style.fontSize = "10px";
            });
        });

        // Style relationship lines & labels
        doc.querySelectorAll("path.er.relationshipLine, line.er.relationshipLine").forEach(el => {
            const r = el as SVGElement;
            r.style.stroke = isDark ? "#6b7280" : "#94a3b8";
            r.style.strokeWidth = "1.5"; r.style.fill = "none";
        });
        doc.querySelectorAll("text.er.relationshipLabel, .relationshipLabel").forEach(el => {
            const t = el as SVGElement;
            t.style.fill = isDark ? "#a9dc76" : "#16a34a";
            t.style.fontWeight = "600"; t.style.fontFamily = f; t.style.fontSize = "11px";
        });
        doc.querySelectorAll("rect.er.relationshipLabelBox").forEach(el => {
            (el as SVGElement).style.fill = "transparent";
            (el as SVGElement).style.stroke = "none";
        });
        // ER marker/arrowheads
        doc.querySelectorAll("marker path, marker line, marker circle").forEach(el => {
            (el as SVGElement).style.stroke = isDark ? "#6b7280" : "#94a3b8";
            (el as SVGElement).style.fill = "none";
        });
    }

    // ── Pie slices ─────────────────────────────────────────────────────────
    if (diagramType === "pie") {
        doc.querySelectorAll("path.slice, .pieSlice, .slice, path[class*='slice']").forEach((el, i) => {
            const s = el as SVGElement;
            s.style.fill = PAL[i % PAL.length];
            s.style.stroke = th.bg;
            s.style.strokeWidth = "2";
        });
    }

    // ── Edge paths ─────────────────────────────────────────────────────────
    doc.querySelectorAll(".edgePath path, .flowchart-link, .transition").forEach(el => {
        const e = el as SVGElement;
        e.style.stroke = "#64748b";
        e.style.strokeWidth = "1.5";
        e.style.fill = "none";
    });

    // ── Arrowheads ─────────────────────────────────────────────────────────
    doc.querySelectorAll("marker polygon, marker path, marker circle").forEach(el => {
        const m = el as SVGElement;
        m.style.fill = "#64748b";
        m.style.stroke = "none";
    });

    // ── SVG text outside nodes (titles, axis labels, etc.) ─────────────────
    doc.querySelectorAll(".titleText, .sectionTitle").forEach(el => {
        const t = el as SVGElement;
        t.style.fill = th.titleFill;
        t.style.fontFamily = f;
    });

    return new XMLSerializer().serializeToString(doc);
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
        const pm = l.match(/^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i);
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
    solid: { da: "none" },
    dot:   { da: "2 5" },
    small: { da: "7 5" },
    long:  { da: "20 8" },
};

const THEMES: Record<string, { bg: string; titleFill: string; boxStroke: string; boxStrokeW: string; labelFill: string; plainTextFill: string }> = {
    light:   { bg: "#ffffff", titleFill: "#1e293b",  boxStroke: "#000000", boxStrokeW: "2",   labelFill: "#000000", plainTextFill: "#1e293b" },
    dark:    { bg: "#16161e", titleFill: "#c0caf5",  boxStroke: "none",    boxStrokeW: "0",   labelFill: "white",   plainTextFill: "#c0caf5" },
    monokai: { bg: "#2C2B2F", titleFill: "#f8f8f2",  boxStroke: "none",    boxStrokeW: "0",   labelFill: "#2C2B2F", plainTextFill: "#f8f8f2" },
};

type UiTheme = {
    headerBg: string; headerBorder: string; headerText: string;
    canvasBg: string;
    panelBg: string; panelBorder: string;
    tabBarBg: string; activeTab: string; activeTabText: string; inactiveTabText: string;
    sectionLabel: string; bodyText: string; divider: string;
    toggleOn: string; accent: string;
    overlayBtnBg: string; pullHandle: string;
    codeBg: string; codeHeaderBg: string; codeBorder: string; codeText: string;
    zoomBg: string; zoomBorder: string; zoomText: string; zoomMuted: string; zoomDivider: string;
    badgeBg: string; badgeText: string;
};
const UI_THEMES: Record<string, UiTheme> = {
    light: {
        headerBg: "#374151",   headerBorder: "#4b5563",   headerText: "#f9fafb",
        canvasBg:  "#c8d0da",
        panelBg:   "#f1f5f9",  panelBorder:  "#e2e8f0",
        tabBarBg:  "#e2e8f0",  activeTab:    "#ffffff",   activeTabText: "#1e293b", inactiveTabText: "#94a3b8",
        sectionLabel: "#94a3b8", bodyText:   "#334155",   divider: "#e2e8f0",
        toggleOn:  "#4b5563",  accent:       "#4b5563",
        overlayBtnBg: "#e8eef5", pullHandle: "#cbd5e1",
        codeBg:    "#ffffff",  codeHeaderBg: "#f8fafc",  codeBorder: "#e2e8f0", codeText: "#1e293b",
        zoomBg:    "white",    zoomBorder:   "#e2e8f0",  zoomText: "#1e293b",   zoomMuted: "#64748b", zoomDivider: "#e2e8f0",
        badgeBg:   "#4b556322", badgeText:   "#4b5563",
    },
    dark: {
        headerBg: "#0d0e14",   headerBorder: "#1e2030",   headerText: "#c0caf5",
        canvasBg:  "#252636",
        panelBg:   "#0f1017",  panelBorder:  "#1e2030",
        tabBarBg:  "#0d0e14",  activeTab:    "#1e2030",   activeTabText: "#c0caf5", inactiveTabText: "#565f89",
        sectionLabel: "#565f89", bodyText:   "#a9b1d6",   divider: "#1e2030",
        toggleOn:  "#7dcfff",  accent:       "#7aa2f7",
        overlayBtnBg: "#1a1b26", pullHandle: "#1e2030",
        codeBg:    "#0d0e14",  codeHeaderBg: "#0a0b10",  codeBorder: "#1e2030", codeText: "#a9b1d6",
        zoomBg:    "#16161e",  zoomBorder:   "#1e2030",  zoomText: "#c0caf5",   zoomMuted: "#565f89", zoomDivider: "#1e2030",
        badgeBg:   "#7aa2f722", badgeText:   "#7aa2f7",
    },
    monokai: {
        headerBg: "#221F22",   headerBorder: "#403E41",   headerText: "#FCFCFA",
        canvasBg:  "#39383C",
        panelBg:   "#2C2B2F",  panelBorder:  "#403E41",
        tabBarBg:  "#221F22",  activeTab:    "#403E41",   activeTabText: "#FCFCFA", inactiveTabText: "#727072",
        sectionLabel: "#727072", bodyText:   "#FCFCFA",   divider: "#403E41",
        toggleOn:  "#A9DC76",  accent:       "#AB9DF2",
        overlayBtnBg: "#221F22", pullHandle: "#403E41",
        codeBg:    "#221F22",  codeHeaderBg: "#19171a",  codeBorder: "#403E41", codeText: "#FCFCFA",
        zoomBg:    "#2D2A2E",  zoomBorder:   "#403E41",  zoomText: "#FCFCFA",   zoomMuted: "#727072", zoomDivider: "#403E41",
        badgeBg:   "#AB9DF222", badgeText:   "#AB9DF2",
    },
};

function buildSvg(d: Diagram, o: Opts, l: Layout): string {
    const { participants: ps, messages: ms } = d;
    if (!ps.length) return "";
    const N = ps.length;
    const BR = 6, HS = l.spacing, LP = l.margin ?? 50, MG = l.stepHeight;
    const AH = 8, SW = 50, SH = 36, FS = l.textSize;
    const BH = Math.max(36, Math.round(FS * 2.6));
    const diagramTitle = d.title ?? DEFAULT_DIAGRAM_TITLE;
    const TOP_PAD = l.margin;
    const BOT_PAD = l.margin;
    const TITLE_H = 68;
    const TP = 50;
    // Auto-fit box width to label content; Width slider = minimum / extra padding
    const HPAD = 24, ICON_W = o.showIcons ? 26 : 0;
    const pBW = ps.map(p => Math.max(l.boxWidth, Math.ceil(p.label.length * (FS * 0.65) + ICON_W + HPAD)));
    const BW = Math.max(...pBW);
    const cx = (i: number) => LP + BW / 2 + i * HS;
    const idx = new Map(ps.map((p, i) => [p.id, i]));
    const W = 2 * LP + (N - 1) * HS + BW;
    const VP = l.vPad ?? 44;
    const H = TOP_PAD + TITLE_H + TP + BH + VP + ms.length * MG + VP + BH + BOT_PAD;
    const lt = TOP_PAD + TITLE_H + TP + BH, lb = H - BOT_PAD - BH;
    const msgY = (s: number) => TOP_PAD + TITLE_H + TP + BH + VP + (s - 1) * MG;
    const f = `'${o.font}', sans-serif`;
    const ld = LIFELINE_DASH[o.lifelineDash] ?? LIFELINE_DASH.long;
    const lifelineSW = ld.sw ?? 1.5;
    const lifelineCapAttr = ld.cap ? ` stroke-linecap="${ld.cap}"` : "";
    const th = THEMES[o.theme] ?? THEMES.light;
    const pal = o.theme === "monokai" ? PAL_MONOKAI : PAL;
    // long-dash style for dashed (response) arrows
    const DASHED_STYLE = ` stroke-dasharray="3 4" stroke-width="1.5"`;
    const parts: string[] = [];
    const defs: string[] = [];
    parts.push(`<rect width="${W}" height="${H}" fill="${th.bg}"/>`);
    const titleY = TOP_PAD + TITLE_H / 2 + 1;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const isDark = o.theme !== "light";
    const titleColor   = isDark ? "#ffffff"  : th.titleFill;
    const subBH        = isDark ? "#e2e8f0"  : "#a0aec0";
    const subPipe      = isDark ? "#94a3b8"  : "#cbd5e0";
    const subDate      = isDark ? "#94a3b8"  : "#718096";
    parts.push(`<text id="diagram-title" x="${LP}" y="${titleY - 10}" dominant-baseline="middle" font-family="${f}" font-size="30" font-weight="800" fill="${titleColor}" style="cursor:pointer">${esc(diagramTitle)}</text>`);
    parts.push(`<text x="${LP}" y="${titleY + 20}" dominant-baseline="middle" font-family="${f}" font-size="11" fill="${subDate}"><tspan font-weight="800" fill="${subBH}">BH</tspan><tspan font-weight="300" fill="${subPipe}"> | </tspan><tspan font-weight="400">${dateStr} · ${timeStr}</tspan></text>`);
    ps.forEach((p, i) => {
        const col = pal[i % pal.length];
        const c = o.coloredLines ? col + "60" : "#d1d5db";
        parts.push(`<line x1="${cx(i)}" y1="${lt}" x2="${cx(i)}" y2="${lb}" stroke="${c}" stroke-width="${lifelineSW}" stroke-dasharray="${ld.da}"${lifelineCapAttr}/>`);
    });
    const renderBox = (p: Participant, i: number, y: number) => {
        const bw = pBW[i];
        const x = cx(i) - bw / 2;
        const col = pal[i % pal.length];
        parts.push(`<rect x="${x}" y="${y}" width="${bw}" height="${BH}" rx="${BR}" fill="${col}" stroke="${th.boxStroke}" stroke-width="${th.boxStrokeW}"/>`);
        if (o.boxOverlay !== "none") {
            const clipId = `bcp${i}_${Math.round(y)}`;
            defs.push(`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${bw}" height="${BH}" rx="${BR}"/></clipPath>`);
            const cg = `clip-path="url(#${clipId})"`;
            const bcx = x + bw / 2, bcy = y + BH / 2;
            if (o.boxOverlay === "gloss") {
                parts.push(`<rect x="${x}" y="${y}" width="${bw}" height="${BH * 0.55}" ${cg} fill="white" fill-opacity="0.18"/>`);
                parts.push(`<rect x="${x}" y="${y}" width="${bw}" height="${BH * 0.22}" ${cg} fill="white" fill-opacity="0.12"/>`);
            } else if (o.boxOverlay === "hatch") {
                const lines: string[] = [];
                const step = 9;
                for (let j = -BH; j < bw + BH; j += step) lines.push(`<line x1="${x+j}" y1="${y+BH}" x2="${x+j+BH}" y2="${y}"/>`);
                parts.push(`<g ${cg} stroke="white" stroke-width="1" opacity="0.18">${lines.join("")}</g>`);
            } else if (o.boxOverlay === "dots") {
                const circles: string[] = [];
                const gap = 7;
                for (let dy = gap / 2; dy < BH; dy += gap)
                    for (let dx = gap / 2; dx < bw; dx += gap)
                        circles.push(`<circle cx="${x+dx}" cy="${y+dy}" r="1.2"/>`);
                parts.push(`<g ${cg} fill="white" opacity="0.22">${circles.join("")}</g>`);
            } else if (o.boxOverlay === "pulse") {
                const maxR = Math.max(bw, BH) * 0.8;
                parts.push(`<g ${cg} fill="none" stroke="white" stroke-width="1" opacity="0.22"><circle cx="${bcx}" cy="${bcy}" r="${BH*0.28}"/><circle cx="${bcx}" cy="${bcy}" r="${BH*0.55}"/><circle cx="${bcx}" cy="${bcy}" r="${BH*0.82}"/><circle cx="${bcx}" cy="${bcy}" r="${maxR}"/></g>`);
            }
        }
        if (o.showIcons) {
            const IPAD = 10, GAP = 6, ISIZE = Math.min(BH - 10, 18);
            const iconKey = ICON_NODES[o.icons[p.id]] ? o.icons[p.id] : guessIconKey(p.label);
            const estLabelW = p.label.length * (FS * 0.6);
            const contentW = ISIZE + GAP + estLabelW;
            const contentX = Math.max(x + IPAD, cx(i) - contentW / 2);
            parts.push(renderIcon(iconKey, contentX + ISIZE / 2, y + BH / 2, ISIZE, th.labelFill));
            parts.push(`<text x="${contentX + ISIZE + GAP}" y="${y + BH / 2 + 1}" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="700" fill="${th.labelFill}">${esc(p.label)}</text>`);
        } else {
            parts.push(`<text x="${cx(i)}" y="${y+BH/2+1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="700" fill="${th.labelFill}">${esc(p.label)}</text>`);
        }
    };
    ps.forEach((p, i) => renderBox(p, i, TOP_PAD + TITLE_H + TP));
    ms.forEach(msg => {
        const fi = idx.get(msg.from) ?? 0, ti = idx.get(msg.to) ?? 0;
        const y = msgY(msg.step);
        const fx = cx(fi), tx = cx(ti);
        const fp = ps[fi];
        const fpColor = pal[fi % pal.length];
        const lc = o.coloredLines ? fpColor : "#374151";
        const tc = o.coloredText ? fpColor : th.plainTextFill;
        const pillTextFill = o.theme === "light" ? "#000000" : "#ffffff";
        if (fi === ti) {
            const lowHeight = MG >= 30 && MG <= 70;
            if (lowHeight) {
                // Compact mode: skip arrow, render pill inline next to step number
                const pillOffset = o.coloredNumbers ? fx + 14 : fx + 6;
                if (o.coloredText) {
                    const pillH = FS + 8, pillW = Math.max(40, msg.text.length * (FS * 0.62) + 12);
                    const pillX = pillOffset, pillY = y - pillH / 2;
                    const isMonokai = o.theme === "monokai";
                    if (isMonokai) {
                        parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${th.bg}"/>`);
                        parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fpColor}" fill-opacity="0.15" stroke="${fpColor}" stroke-width="1.5"/>`);
                    } else {
                        parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${th.bg}"/>`);
                        parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fpColor}" fill-opacity="0.5"/>`);
                    }
                    parts.push(`<text x="${pillX + pillW / 2}" y="${pillY + pillH / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="600" fill="${pillTextFill}">${esc(msg.text)}</text>`);
                } else {
                    parts.push(`<text x="${pillOffset}" y="${y+1}" dominant-baseline="middle" font-family="${f}" font-size="${FS}" fill="${tc}">${esc(msg.text)}</text>`);
                }
            } else {
            const isDashed = msg.arrow === "dashed";
            const pathStyle = isDashed ? `fill="none" stroke="${lc}"${DASHED_STYLE}` : `fill="none" stroke="${lc}" stroke-width="1.5"`;
            const selfX1 = o.coloredNumbers ? fx + 11 : fx;
            parts.push(`<path d="M${selfX1} ${y} H${fx+SW} V${y+SH} H${fx}" ${pathStyle}/>`);
            parts.push(`<polygon points="${fx},${y+SH} ${fx+AH},${y+SH-5} ${fx+AH},${y+SH+5}" fill="${lc}"/>`);
            if (o.coloredText) {
                const pillH = FS + 8, pillW = Math.max(40, msg.text.length * (FS * 0.62) + 12);
                const pillX = fx + SW + 5, pillY = y + SH / 2 - pillH / 2;
                const isMonokai = o.theme === "monokai";
                if (isMonokai) {
                    parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${th.bg}"/>`);
                    parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fpColor}" fill-opacity="0.15" stroke="${fpColor}" stroke-width="1.5"/>`);
                } else {
                    parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${th.bg}"/>`);
                    parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fpColor}" fill-opacity="0.5"/>`);
                }
                parts.push(`<text x="${pillX + pillW / 2}" y="${pillY + pillH / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="600" fill="${pillTextFill}">${esc(msg.text)}</text>`);
            } else {
                parts.push(`<text x="${fx+SW+5}" y="${y+SH/2+1}" dominant-baseline="middle" font-family="${f}" font-size="${FS}" fill="${tc}">${esc(msg.text)}</text>`);
            }
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
                const pillY = y - pillH / 2;
                // Clamp pill so it never overlaps the step circle at fx
                const circleRoom = o.coloredNumbers ? 24 : 4;
                const leftBound = Math.min(fx, tx) + circleRoom;
                const pillX = Math.max(mid - pillW / 2, leftBound);
                const pillCx = pillX + pillW / 2;
                const isMonokai = o.theme === "monokai";
                if (isMonokai) {
                    parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${th.bg}"/>`);
                    parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fpColor}" fill-opacity="0.15" stroke="${fpColor}" stroke-width="1.5"/>`);
                } else {
                    parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${th.bg}"/>`);
                    parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fpColor}" fill-opacity="0.5"/>`);
                }
                parts.push(`<text x="${pillCx}" y="${pillY + pillH / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="600" fill="${pillTextFill}">${esc(msg.text)}</text>`);
            } else {
                parts.push(`<text x="${mid}" y="${y-8}" text-anchor="middle" font-family="${f}" font-size="${FS}" fill="${tc}">${esc(msg.text)}</text>`);
            }
        }
        if (o.coloredNumbers) {
            parts.push(`<circle cx="${fx}" cy="${y}" r="10" fill="${fpColor}" stroke="${fpColor}" stroke-width="2"/>`);
            parts.push(`<text x="${fx}" y="${y+1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="11" font-weight="700" fill="${th.labelFill}">${msg.displayStep ?? msg.step}</text>`);
        }
    });
    ps.forEach((p, i) => renderBox(p, i, H - BOT_PAD - BH));
    if (defs.length) parts.splice(1, 0, `<defs>${defs.join("")}</defs>`);
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
function SliderRow({ label, value, min, max, unit = "", fontSize = 12, ut, onChange }: {
    label: string; value: number; min: number; max: number; unit?: string; fontSize?: number; ut: UiTheme; onChange: (v: number) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <span style={{ fontSize, color: ut.bodyText, fontWeight: 400, whiteSpace: "nowrap", width: 44, flexShrink: 0 }}>{label}</span>
            <input type="range" min={min} max={max} value={value}
                onChange={e => onChange(parseInt(e.target.value))}
                className="flex-1 min-w-0" />
            <span style={{ fontSize, color: ut.sectionLabel, fontWeight: 500, whiteSpace: "nowrap", width: 28, textAlign: "right", flexShrink: 0 }}>{value}{unit}</span>
        </div>
    );
}

// ── Icon button ───────────────────────────────────────────────────────────────
function IconBtn({ active, onClick, accent = "#0a84ff", inactiveBg = "#2a2a2c", color = "white", children }: { active: boolean; onClick: () => void; accent?: string; inactiveBg?: string; color?: string; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:brightness-125"
            style={{ background: active ? accent : inactiveBg, color: active ? "white" : color }}
        >{children}</button>
    );
}

// ── URL encode/decode helpers (LZ-String compressed) ──────────────────────────
function encodeData(s: string): string {
    try { return LZString.compressToEncodedURIComponent(s); } catch { return ""; }
}
function decodeData(s: string): string {
    // Try LZ-String first, fall back to legacy base64 for old URLs
    try {
        const lz = LZString.decompressFromEncodedURIComponent(s);
        if (lz) return lz;
    } catch {}
    try { return decodeURIComponent(atob(s).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")); } catch { return ""; }
}

// ── Settings content (shared between desktop panel + mobile sheet) ─────────────
function SettingsContent({
    opts, layout, copied, copiedLink, copiedShare, mobile = false, participants = [], isSequence = true,
    upd, updL, exportPng, exportCode, exportJson, copyCode, copyLink, share, viewUrl, onPresent,
}: {
    opts: Opts; layout: Layout; copied: boolean; copiedLink: boolean; copiedShare: boolean;
    mobile?: boolean; participants?: Participant[]; isSequence?: boolean; viewUrl: string;
    upd: (p: Partial<Opts>) => void;
    updL: (p: Partial<Layout>) => void;
    exportPng: () => void; exportCode: () => void; exportJson: () => void;
    copyCode: () => void; copyLink: () => void; share: () => void; onPresent: () => void;
}) {
    const fs = (base: number) => mobile ? Math.round(base * 1.2) : base;
    const [tab, setTab] = useState<"general" | "components" | "share">("general");
    const ut = UI_THEMES[opts.theme] ?? UI_THEMES.light;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Tabs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, background: ut.tabBarBg, borderRadius: 8, padding: 2 }}>
                {(["general", "components", "share"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                        padding: "5px 4px", borderRadius: 6, fontSize: fs(10), fontWeight: 700,
                        textTransform: "capitalize", letterSpacing: "0.02em",
                        background: tab === t ? ut.activeTab : "transparent",
                        color: tab === t ? ut.activeTabText : ut.inactiveTabText,
                        border: "none", cursor: "pointer", transition: "all 0.15s",
                    }}>{t}</button>
                ))}
            </div>

            {tab === "general" && <>
                {/* Theme */}
                <div>
                    <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Theme</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                        {(["light", "dark", "monokai"] as const).map(t => (
                            <button key={t} onClick={() => upd({ theme: t })}
                                style={{
                                    padding: mobile ? "8px 4px" : "6px 4px", borderRadius: 8, fontSize: fs(10), fontWeight: 700,
                                    textTransform: "capitalize", letterSpacing: "0.02em",
                                    border: opts.theme === t ? `2px solid ${ut.accent}` : `2px solid ${ut.panelBorder}`,
                                    background: opts.theme === t ? `${ut.accent}14` : ut.overlayBtnBg,
                                    color: opts.theme === t ? ut.accent : ut.bodyText,
                                    cursor: "pointer", transition: "all 0.15s",
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                                }}
                            >{t}</button>
                        ))}
                    </div>
                </div>

                {isSequence && <>
                    <div style={{ height: 1, background: ut.divider }} />

                    {/* Style toggles */}
                    <div>
                        <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>Style</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 10 : 7 }}>
                            {([ ["coloredLines","Line Colors"], ["coloredNumbers","Numbers"], ["coloredText","Text Pill"] ] as const).map(([k, label]) => (
                                <div key={k} className="flex items-center justify-between cursor-pointer select-none"
                                    onClick={() => upd({ [k]: !opts[k] } as Partial<Opts>)}>
                                    <span style={{ fontSize: fs(11), color: ut.bodyText, fontWeight: 400 }}>{label}</span>
                                    <div style={{ position: "relative", width: 34, height: 20, borderRadius: 10, flexShrink: 0, background: opts[k] ? ut.toggleOn : ut.tabBarBg, transition: "background 0.2s", cursor: "pointer" }}>
                                        <div style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 8, background: "white", left: opts[k] ? 16 : 2, transition: "left 0.2s ease", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ height: 1, background: ut.divider }} />

                    {/* Line type */}
                    <div>
                        <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Line</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                            {([
                                ["solid", "Solid",      "—————"],
                                ["long",  "Long dash",  "– – –"],
                                ["small", "Short dash", "- - -"],
                                ["dot",   "Dot",        "· · ·"],
                            ] as const).map(([v, label, preview]) => {
                                const active = opts.lifelineDash === v;
                                return (
                                    <button key={v} onClick={() => upd({ lifelineDash: v })}
                                        style={{
                                            padding: mobile ? "8px 6px" : "6px 6px", borderRadius: 8,
                                            fontSize: fs(10), fontWeight: 700,
                                            border: active ? `2px solid ${ut.accent}` : "2px solid transparent",
                                            background: ut.overlayBtnBg,
                                            color: active ? ut.accent : ut.inactiveTabText,
                                            cursor: "pointer", transition: "border 0.15s, color 0.15s",
                                            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                                        }}
                                    >
                                        <span style={{ fontSize: fs(11), letterSpacing: v === "solid" ? "0" : "2px" }}>{preview}</span>
                                        <span style={{ fontSize: fs(8), opacity: 0.7, fontWeight: 500 }}>{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ height: 1, background: ut.divider }} />

                    <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                            <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em" }}>Layout</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => upd({ autoLayout: !opts.autoLayout })}>
                                <span style={{ fontSize: fs(10), fontWeight: 600, color: opts.autoLayout ? ut.toggleOn : ut.sectionLabel, transition: "color 0.15s" }}>Auto</span>
                                <div style={{ position: "relative", width: 32, height: 18, borderRadius: 9, background: opts.autoLayout ? ut.toggleOn : ut.panelBorder, transition: "background 0.2s" }}>
                                    <div style={{ position: "absolute", top: 2, left: opts.autoLayout ? 16 : 2, width: 14, height: 14, borderRadius: 7, background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                                </div>
                            </div>
                        </div>
                        {!opts.autoLayout && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <SliderRow label="Height" value={layout.stepHeight} min={30} max={80} fontSize={fs(12)} ut={ut} onChange={v => updL({ stepHeight: v })} />
                            <SliderRow label="Width" value={layout.boxWidth} min={80} max={400} fontSize={fs(12)} ut={ut} onChange={v => updL({ boxWidth: v })} />
                            <SliderRow label="Gap" value={layout.spacing} min={120} max={450} fontSize={fs(12)} ut={ut} onChange={v => updL({ spacing: v })} />
                            <SliderRow label="V.Gap" value={layout.vPad ?? 44} min={20} max={300} fontSize={fs(12)} ut={ut} onChange={v => updL({ vPad: v })} />
                            <SliderRow label="Font" value={layout.textSize} min={8} max={20} unit="px" fontSize={fs(12)} ut={ut} onChange={v => updL({ textSize: v })} />
                            <SliderRow label="Margin" value={layout.margin} min={120} max={200} fontSize={fs(12)} ut={ut} onChange={v => updL({ margin: v })} />
                        </div>}
                    </div>
                </>}

            </>}

            {tab === "share" && <>
                {/* QR code → read-only view */}
                {viewUrl && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ background: "#ffffff", borderRadius: 12, padding: 10, display: "inline-flex" }}>
                        {viewUrl.length > 2000
                            ? <div style={{ width: 160, height: 160, borderRadius: 8, background: "repeating-linear-gradient(45deg,#e2e8f0 0,#e2e8f0 4px,#f8fafc 4px,#f8fafc 12px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", padding: "0 12px", lineHeight: 1.4 }}>Diagram too large for QR</span>
                              </div>
                            : <QRCodeSVG value={viewUrl} size={160} bgColor="#ffffff" fgColor="#1e293b" level="M" />
                        }
                    </div>
                    <p style={{ fontSize: fs(10), color: ut.sectionLabel, textAlign: "center", margin: 0, lineHeight: 1.5 }}>
                        Scan to open read-only canvas
                    </p>
                    <button onClick={onPresent}
                        className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                        style={{ background: ut.accent, color: "#221F22", cursor: "pointer", padding: mobile ? "10px 28px" : "8px 24px", fontSize: fs(12), border: "none" }}>
                        ▶ Present
                    </button>
                </div>}

                <div style={{ height: 1, background: ut.divider }} />

                <div>
                    <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Download</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                        {/* Row 1 */}
                        <button onClick={exportPng}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: "#FF6188", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            PNG
                        </button>
                        <button onClick={exportCode}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: "#FC9867", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            Code
                        </button>
                        {/* Row 2 */}
                        <button onClick={copyLink}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: copiedLink ? "#A9DC76" : "#FFD866", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            {copiedLink ? "Copied!" : "Link"}
                        </button>
                        <button onClick={exportJson}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: "#A9DC76", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            JSON
                        </button>
                        {/* Row 3 */}
                        <button onClick={share}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: copiedShare ? "#A9DC76" : "#78DCE8", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            {copiedShare ? "Shared!" : "Share"}
                        </button>
                        <button onClick={copyCode}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: copied ? "#A9DC76" : "#AB9DF2", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                </div>
            </>}

            {tab === "components" && isSequence && <>
                {/* Box Overlay */}
                <div>
                    <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Overlay</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                        {([
                            ["none",  "None",   "—"],
                            ["gloss", "Gloss",  "✦"],
                            ["hatch", "Hatch",  "▨"],
                            ["dots",  "Dots",   "⁘"],
                            ["pulse", "Pulse",  "◎"],
                        ] as const).map(([v, label, icon]) => (
                            <button key={v} onClick={() => upd({ boxOverlay: v })}
                                style={{
                                    padding: mobile ? "8px 4px" : "6px 4px", borderRadius: 8,
                                    fontSize: fs(10), fontWeight: 700, letterSpacing: "0.02em",
                                    border: opts.boxOverlay === v ? `2px solid ${ut.accent}` : "2px solid transparent",
                                    background: ut.overlayBtnBg, color: opts.boxOverlay === v ? ut.accent : ut.inactiveTabText,
                                    cursor: "pointer", transition: "border 0.15s, color 0.15s",
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                                }}
                            ><span>{icon}</span><span>{label}</span></button>
                        ))}
                    </div>
                </div>

                {/* Icons toggle */}
                <div style={{ height: 1, background: ut.divider }} />
                <div className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => upd({ showIcons: !opts.showIcons })}>
                    <span style={{ fontSize: fs(11), color: ut.bodyText, fontWeight: 400 }}>Icons</span>
                    <div style={{
                        position: "relative", width: 34, height: 20, borderRadius: 10, flexShrink: 0,
                        background: opts.showIcons ? ut.toggleOn : ut.tabBarBg,
                        transition: "background 0.2s", cursor: "pointer",
                    }}>
                        <div style={{
                            position: "absolute", top: 2, width: 16, height: 16, borderRadius: 8,
                            background: "white", left: opts.showIcons ? 16 : 2,
                            transition: "left 0.2s ease",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                        }} />
                    </div>
                </div>

                {/* Icons editor — only when showIcons is on */}
                {opts.showIcons && participants.length > 0 && <>
                    <div style={{ height: 1, background: ut.divider }} />
                    <div>
                        <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Icons</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {participants.map(p => {
                                const currentKey = ICON_NODES[opts.icons[p.id]] ? opts.icons[p.id] : guessIconKey(p.label);
                                return (
                                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color, flexShrink: 0 }} />
                                        <span style={{ fontSize: fs(12), color: ut.bodyText, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                                        <IconPicker
                                            value={currentKey}
                                            color={p.color}
                                            ut={ut}
                                            onChange={k => upd({ icons: { ...opts.icons, [p.id]: k } })}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>}
            </>}

            {tab === "components" && !isSequence && (
                <div style={{ color: ut.inactiveTabText, fontSize: fs(12), textAlign: "center", paddingTop: 20 }}>No component options for this diagram type.</div>
            )}
        </div>
    );
}

// ── IconSvg — renders an icon key as React SVG ────────────────────────────────
function IconSvg({ iconKey, size = 16, color = "currentColor" }: { iconKey: string; size?: number; color?: string }) {
    const nodes = ICON_NODES[iconKey] ?? ICON_NODES.package;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
            {nodes.map(([tag, props], i) => {
                const p = props as Record<string, string | number>;
                if (tag === "path")     return <path key={i} {...p} />;
                if (tag === "rect")     return <rect key={i} {...p} />;
                if (tag === "circle")   return <circle key={i} {...p} />;
                if (tag === "ellipse")  return <ellipse key={i} {...p} />;
                if (tag === "polygon")  return <polygon key={i} {...p} />;
                if (tag === "polyline") return <polyline key={i} {...p} />;
                return null;
            })}
        </svg>
    );
}

// ── IconPicker ─────────────────────────────────────────────────────────────────
function IconPicker({ value, color, ut, onChange }: { value: string; color: string; ut: UiTheme; onChange: (k: string) => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const filtered = ICON_KEYS.filter(k => !search || k.includes(search.toLowerCase()));

    return (
        <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
            <button
                onClick={() => { setOpen(o => !o); setSearch(""); }}
                title={value}
                style={{ width: 28, height: 28, borderRadius: 7, background: color, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
                <IconSvg iconKey={value} size={15} color="white" />
            </button>
            {open && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 999, background: ut.panelBg, border: `1px solid ${ut.panelBorder}`, borderRadius: 10, padding: 8, width: 232, boxShadow: "0 8px 32px rgba(0,0,0,0.7)" }}>
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search… (u = user, db, bot…)"
                        style={{ width: "100%", background: ut.activeTab, border: `1px solid ${ut.divider}`, borderRadius: 6, color: ut.bodyText, fontSize: 11, padding: "5px 8px", outline: "none", marginBottom: 8, boxSizing: "border-box" }}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, maxHeight: 210, overflowY: "auto" }}>
                        {filtered.map(k => (
                            <button
                                key={k}
                                onClick={() => { onChange(k); setOpen(false); }}
                                title={k}
                                style={{
                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                    gap: 4, padding: "7px 4px", borderRadius: 7, cursor: "pointer",
                                    background: k === value ? color + "33" : "transparent",
                                    border: k === value ? `1px solid ${color}88` : "1px solid transparent",
                                    color: ut.bodyText,
                                }}
                            >
                                <IconSvg iconKey={k} size={18} color={k === value ? color : ut.zoomMuted} />
                                <span style={{ fontSize: 8, color: ut.sectionLabel, textAlign: "center", lineHeight: 1.2, overflow: "hidden", width: "100%", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
                            </button>
                        ))}
                        {filtered.length === 0 && <span style={{ gridColumn: "1/-1", color: ut.inactiveTabText, fontSize: 11, textAlign: "center", padding: 12 }}>No icons found</span>}
                    </div>
                </div>
            )}
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
    const [copiedLink, setCopiedLink] = useState(false);
    const [copiedShare, setCopiedShare] = useState(false);
    const [hasFit, setHasFit] = useState(false);
    const [fitActive, setFitActive] = useState(true);
    const fitActiveRef = useRef(true);
    const [opts, setOpts] = useState<Opts>(DEFAULT_OPTS);
    const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
    const [zoom, setZoom] = useState(1.0);
    const [mermaidSvg, setMermaidSvg] = useState<string>("");
    const [viewMode, setViewMode] = useState(false);
    const [hoverScreenY, setHoverScreenY] = useState<number | null>(null);
    const [lanIp, setLanIp] = useState<string | null>(null);
    const [titleEdit, setTitleEdit] = useState<{ value: string; rect: DOMRect } | null>(null);

    const diagramType = useMemo(() => detectDiagramType(code), [code]);
    const isSequence = diagramType === "sequence";

    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [isPanning, setIsPanning] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);
    const svgWrapRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);
    const resizeStartX = useRef(0);
    const resizeStartW = useRef(340);
    const isDragging = useRef(false);
    const dragStartMouse = useRef({ x: 0, y: 0 });
    const dragStartPan = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(1.0);
    const panRef = useRef({ x: 0, y: 0 });
    const svgDimsRef = useRef<{ w: number; h: number } | null>(null);
    const spaceHeld = useRef(false);
    const viewWheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Title inline edit ─────────────────────────────────────────────────
    // Hide the SVG title element while the input is open to prevent overlap
    useEffect(() => {
        const el = svgWrapRef.current?.querySelector<SVGTextElement>("#diagram-title");
        if (!el) return;
        el.style.visibility = titleEdit ? "hidden" : "";
    }, [titleEdit]);

    const commitTitle = useCallback((val: string) => {
        setTitleEdit(null);
        const t = val.trim();
        if (!t) return;
        setCode(prev => /^title:\s*.+$/im.test(prev)
            ? prev.replace(/^title:\s*.+$/im, `title: ${t}`)
            : prev.replace(/^(sequenceDiagram[^\n]*\n?)/im, `$1title: ${t}\n`));
    }, []);

    // Apply transform directly to DOM — bypasses React render cycle for smooth gestures
    const applyTransform = useCallback((p: { x: number; y: number }, z: number) => {
        if (!svgWrapRef.current) return;
        svgWrapRef.current.style.transform = `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px))`;
        const dims = svgDimsRef.current;
        if (dims) {
            const svgEl = svgWrapRef.current.querySelector("svg");
            if (svgEl) {
                svgEl.setAttribute("width",  String(Math.round(dims.w * z)));
                svgEl.setAttribute("height", String(Math.round(dims.h * z)));
            }
        }
    }, []);

    // Sync refs → React state (call on gesture end only)
    const syncTransformState = useCallback(() => {
        setZoom(zoomRef.current);
        setPanX(panRef.current.x);
        setPanY(panRef.current.y);
    }, []);

    // Keep refs in sync for use in event handlers
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);
    useEffect(() => { panRef.current = { x: panX, y: panY }; }, [panX, panY]);
    fitActiveRef.current = fitActive;
    // Re-apply transform after every render — prevents React from overwriting
    // the direct DOM transform set by applyTransform during gestures.
    // useLayoutEffect runs synchronously before paint so there is zero flicker.
    useLayoutEffect(() => { if (svgWrapRef.current) applyTransform(panRef.current, zoomRef.current); });

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
                zoomRef.current = newZoom;
                panRef.current = { x: dx * (1 - ratio) + panRef.current.x * ratio, y: dy * (1 - ratio) + panRef.current.y * ratio };
                applyTransform(panRef.current, zoomRef.current);
                setZoom(newZoom); setPanX(panRef.current.x); setPanY(panRef.current.y); setFitActive(false);
            } else {
                // Pan
                panRef.current = { x: panRef.current.x - e.deltaX, y: panRef.current.y - e.deltaY };
                applyTransform(panRef.current, zoomRef.current);
                setPanX(panRef.current.x); setPanY(panRef.current.y);
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
                // midpoint relative to canvas center
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                startPinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - cx;
                startPinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - cy;
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

        let startPinchMidX = 0, startPinchMidY = 0;

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && startPinchDist !== null) {
                e.preventDefault();
                const d = getDist(e.touches);
                const ratio = d / startPinchDist;
                const newZoom = Math.min(4, Math.max(0.1, startZoomVal * ratio));
                const zoomRatio = newZoom / startZoomVal;
                const newPanX = startPinchMidX * (1 - zoomRatio) + startPinchPanX * zoomRatio;
                const newPanY = startPinchMidY * (1 - zoomRatio) + startPinchPanY * zoomRatio;
                zoomRef.current = newZoom;
                panRef.current = { x: newPanX, y: newPanY };
                applyTransform(panRef.current, zoomRef.current);
            } else if (e.touches.length === 1 && isTouchPanning) {
                e.preventDefault();
                panRef.current = {
                    x: startPanX + (e.touches[0].clientX - startTouchX),
                    y: startPanY + (e.touches[0].clientY - startTouchY),
                };
                applyTransform(panRef.current, zoomRef.current);
            }
        };

        const onTouchEnd = () => {
            startPinchDist = null;
            isTouchPanning = false;
            syncTransformState();
            setFitActive(false);
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
            panRef.current = {
                x: dragStartPan.current.x + (e.clientX - dragStartMouse.current.x),
                y: dragStartPan.current.y + (e.clientY - dragStartMouse.current.y),
            };
            applyTransform(panRef.current, zoomRef.current);
        };
        const onUp = () => {
            if (isDragging.current) { isDragging.current = false; setIsPanning(false); syncTransformState(); }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    }, []);

    // ── Mount + localStorage + URL param ─────────────────────────────────
    useEffect(() => {
        setMounted(true);
        setIsMobile(window.innerWidth < 768);
        // Fetch LAN IP for QR code when on localhost
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
            fetch("/api/lan-ip").then(r => r.json()).then(d => { if (d.ip) setLanIp(d.ip); }).catch(() => {});
        }

        // URL ?data= takes priority over localStorage
        const params = new URLSearchParams(window.location.search);
        if (params.get("view") === "1") setViewMode(true);
        const urlData = params.get("data");
        if (urlData) {
            const decoded = decodeData(urlData);
            if (decoded) { setCode(decoded); return; }
        }
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

    // ── Mermaid rendering for non-sequence diagrams ───────────────────────
    useEffect(() => {
        if (!mounted || isSequence) { setMermaidSvg(""); return; }
        let cancelled = false;
        const currentType = detectDiagramType(code);
        import("mermaid").then(({ default: mermaid }) => {
            mermaid.initialize({
                startOnLoad: false,
                theme: "base",
                themeVariables: {
                    background: THEMES[opts.theme]?.bg ?? "#ffffff",
                    primaryColor: PAL[0],
                    primaryTextColor: "#ffffff",
                    primaryBorderColor: "transparent",
                    lineColor: "#64748b",
                    fontFamily: "'Inter', sans-serif",
                    edgeLabelBackground: "transparent",
                    clusterBkg: "transparent",
                },
                securityLevel: "loose",
            });
            mermaid.render("mermaid-svg-" + Date.now(), stripFrontmatter(code)).then(({ svg: renderedSvg }) => {
                if (!cancelled) setMermaidSvg(applyColorfulMermaidStyle(renderedSvg, opts, currentType));
            }).catch(() => {
                if (!cancelled) setMermaidSvg("");
            });
        });
        return () => { cancelled = true; };
    }, [code, opts.theme, mounted, isSequence]);

    const diagram = useMemo(() => parse(code), [code]);

    // ── Auto layout — compute from diagram content ────────────────────────
    const computedLayout = useMemo((): Layout => {
        if (!opts.autoLayout) return layout;

        const rows = diagram.messages.length;
        const ICON_W = opts.showIcons ? 26 : 0;

        // Font size: shrink slightly for large diagrams
        const FS = rows > 30 ? 11 : rows > 15 ? 12 : 13;

        // Box width: fit the longest participant label
        const HPAD = 24;
        const boxWidth = Math.max(90, ...diagram.participants.map(p =>
            Math.ceil(p.label.length * (FS * 0.65) + ICON_W + HPAD)
        ));

        // Step height: compress for dense diagrams
        const stepHeight = rows > 40 ? 32 : rows > 20 ? 36 : rows > 10 ? 40 : 44;

        // Spacing: box width + enough room for the longest adjacent message pill + step circle
        const maxMsgLen = diagram.messages.reduce((m, msg) => Math.max(m, msg.text.length), 0);
        const pillEstimate = maxMsgLen * (FS * 0.65) + 48; // 0.65 char width + circle room
        const spacing = Math.round(Math.max(boxWidth + 80, boxWidth + pillEstimate));

        // vPad: tighter for dense diagrams
        const vPad = rows > 20 ? 30 : 44;

        // margin: proportional to spacing
        const margin = Math.round(Math.max(80, spacing * 0.4));

        return { textSize: FS, boxWidth, spacing, stepHeight, vPad, margin };
    }, [opts.autoLayout, opts.showIcons, diagram, layout]);

    const svg = useMemo(() => buildSvg(diagram, opts, computedLayout), [diagram, opts, computedLayout]);

    const activeSvg = isSequence ? svg : mermaidSvg;

    const svgDims = useMemo(() => {
        const m = activeSvg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
        if (m) return { w: parseFloat(m[1]), h: parseFloat(m[2]) };
        // mermaid sometimes uses viewBox only
        const vb = activeSvg.match(/viewBox="[^"]*0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
        return vb ? { w: parseFloat(vb[1]), h: parseFloat(vb[2]) } : null;
    }, [activeSvg]);
    // Inline sync avoids SWC/Linux minifier TDZ bug (useEffect([svgDims]) gets hoisted before declaration)
    svgDimsRef.current = svgDims;

    const fitZoom = useCallback(() => {
        if (!canvasRef.current || !svgDims) return;
        const { clientWidth: cw, clientHeight: ch } = canvasRef.current;
        const newZoom = parseFloat(Math.min((cw - 48) / svgDims.w, (ch - 48) / svgDims.h).toFixed(3));
        zoomRef.current = newZoom;
        panRef.current = { x: 0, y: 0 };
        applyTransform(panRef.current, zoomRef.current);
        setZoom(newZoom); setPanX(0); setPanY(0); setFitActive(true);
    }, [svgDims, applyTransform]);

    useEffect(() => {
        if (svgDims && !hasFit) {
            const id = requestAnimationFrame(() => { fitZoom(); setHasFit(true); });
            return () => cancelAnimationFrame(id);
        }
    }, [svgDims, hasFit, fitZoom]);

    const panelMounted = useRef(false);
    useEffect(() => {
        if (!panelMounted.current) { panelMounted.current = true; return; }
        const id = requestAnimationFrame(() => { if (fitActiveRef.current) fitZoom(); });
        return () => cancelAnimationFrame(id);
    }, [showSettings, showCode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Keep body background in sync with canvas colour ───────────────────
    useEffect(() => {
        const bg = (UI_THEMES[opts.theme] ?? UI_THEMES.light).canvasBg;
        document.body.style.background = bg;
        document.documentElement.style.background = bg;
        return () => { document.body.style.background = ""; document.documentElement.style.background = ""; };
    }, [opts.theme]);

    // ── Re-fit on resize / orientation change ─────────────────────────────
    useEffect(() => {
        if (!mounted) return;
        let tid: ReturnType<typeof setTimeout>;
        const onResize = () => { clearTimeout(tid); tid = setTimeout(() => { if (fitActiveRef.current) fitZoom(); }, 120); };
        window.addEventListener("resize", onResize);
        screen.orientation?.addEventListener("change", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
            screen.orientation?.removeEventListener("change", onResize);
            clearTimeout(tid);
        };
    }, [mounted, fitZoom]);

    // ── Keyboard shortcuts (Figma-like) ───────────────────────────────────
    useEffect(() => {
        if (!mounted) return;
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName;
            if (e.key === "Escape") { setShowCode(false); setShowSettings(false); return; }
            if (tag === "TEXTAREA" || tag === "INPUT") return;
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key === "0") { e.preventDefault(); fitZoom(); }
            if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); const nz = parseFloat(Math.min(4, zoomRef.current + 0.15).toFixed(2)); zoomRef.current = nz; applyTransform(panRef.current, nz); setZoom(nz); setFitActive(false); }
            if (mod && e.key === "-") { e.preventDefault(); const nz = parseFloat(Math.max(0.1, zoomRef.current - 0.15).toFixed(2)); zoomRef.current = nz; applyTransform(panRef.current, nz); setZoom(nz); setFitActive(false); }
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
    const exportFilename = (ext: string) => {
        const title = (diagram.title ?? "diagram").replace(/[^a-z0-9]/gi, "-").toLowerCase();
        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toTimeString().slice(0, 5).replace(":", "-");
        return `${title}-${date}-${time}.${ext}`;
    };

    const exportPng = useCallback(() => {
        const exportSvg = activeSvg;
        if (!exportSvg) return;
        const url = URL.createObjectURL(new Blob([exportSvg], { type: "image/svg+xml" }));
        const img = new Image();
        img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width * 2; c.height = img.height * 2;
            const ctx = c.getContext("2d")!;
            ctx.scale(2, 2); ctx.fillStyle = THEMES[opts.theme]?.bg ?? "#ffffff"; ctx.fillRect(0, 0, img.width, img.height);
            ctx.drawImage(img, 0, 0);
            c.toBlob(b => { if (!b) return; const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = exportFilename("png"); a.click(); });
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }, [activeSvg, opts]);

    const exportCode = useCallback(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
        a.download = exportFilename("txt"); a.click();
    }, [code]);

    const exportJson = useCallback(() => {
        const data = isSequence ? diagram : { type: diagramType, code };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        a.download = exportFilename("json"); a.click();
    }, [diagram, isSequence, diagramType, code]);

    const copyCode = useCallback(() => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [code]);

    const buildShareUrl = useCallback(() => {
        const encoded = encodeData(code);
        return `${window.location.origin}${window.location.pathname}?data=${encoded}`;
    }, [code]);

    const buildViewUrl = useCallback(() => {
        const encoded = encodeData(code);
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const base = isLocal && lanIp
            ? `http://${lanIp}:${window.location.port}`
            : window.location.origin;
        return `${base}${window.location.pathname}?data=${encoded}&view=1`;
    }, [code, lanIp]);

    const copyLink = useCallback(() => {
        const url = buildShareUrl();
        const confirm = () => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1500); };
        const fallback = () => {
            try {
                const ta = document.createElement("textarea");
                ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                confirm();
            } catch { /* ignore */ }
        };
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(confirm).catch(fallback);
        } else {
            fallback();
        }
    }, [buildShareUrl]);

    const share = useCallback(() => {
        const url = buildShareUrl();
        if (navigator.share) {
            navigator.share({ title: "Mermaid++ Diagram", url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url).then(() => {
                setCopiedShare(true);
                setTimeout(() => setCopiedShare(false), 1500);
            });
        }
    }, [buildShareUrl]);

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

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLElement>) => {
        const pasted = e.clipboardData.getData("text");
        const parsed = parse(pasted);
        if (parsed.participants.length >= 2) setTimeout(fireConfetti, 150);
        // Re-fit after paste so new diagram fills the canvas
        setTimeout(fitZoom, 120);
    }, [fireConfetti, fitZoom]);

    const zoomPct = Math.round(zoom * 100);
    const ut = UI_THEMES[opts.theme] ?? UI_THEMES.light;

    // ── Presenter mode ────────────────────────────────────────────────────
    const presenterSelectedEl = useRef<SVGElement | null>(null);
    const spotlightRef = useRef<HTMLDivElement | null>(null);
    const spotlightActiveRef = useRef(false);
    const [spotlightActive, setSpotlightActive] = useState(false);

    const enterPresenter = useCallback(() => {
        setViewMode(true);
        document.documentElement.requestFullscreen?.().catch(() => {});
    }, []);

    const exitPresenter = useCallback(() => {
        if (presenterSelectedEl.current) {
            presenterSelectedEl.current.style.filter = "";
            presenterSelectedEl.current.style.stroke = "";
            presenterSelectedEl.current = null;
        }
        setViewMode(false);
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }, []);

    const presenterEscRef = useRef(false);
    const presenterEscTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [presenterEscPending, setPresenterEscPending] = useState(false);

    useEffect(() => {
        if (!viewMode) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (presenterEscRef.current) {
                // Second Esc — exit
                presenterEscRef.current = false;
                setPresenterEscPending(false);
                if (presenterEscTimerRef.current) clearTimeout(presenterEscTimerRef.current);
                exitPresenter();
            } else {
                // First Esc — warn
                presenterEscRef.current = true;
                setPresenterEscPending(true);
                presenterEscTimerRef.current = setTimeout(() => {
                    presenterEscRef.current = false;
                    setPresenterEscPending(false);
                }, 2000);
            }
        };
        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }, [viewMode, exitPresenter]);

    const handlePresenterClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as SVGElement;
        // Clear previous highlight
        if (presenterSelectedEl.current) {
            presenterSelectedEl.current.style.filter = "";
            presenterSelectedEl.current.style.opacity = "";
            presenterSelectedEl.current = null;
        }
        // Skip if click is on the SVG background rect (first child of svg)
        const svg = svgWrapRef.current?.querySelector("svg");
        if (!svg || target === svg || target === svg.firstElementChild) return;
        // Find nearest highlightable element
        const el = target.closest("rect, line, polyline, polygon, path, circle, text") as SVGElement | null;
        if (!el || el === svg.firstElementChild) return;
        presenterSelectedEl.current = el;
        el.style.filter = "drop-shadow(0 0 8px #FFD866) drop-shadow(0 0 20px rgba(255,216,102,0.7))";
    }, []);

    // ── Presentation / view-only mode ─────────────────────────────────────
    if (viewMode) {
        const stepHeight = layout.stepHeight;
        return (
            <div
                ref={canvasRef}
                style={{ position: "relative", width: "100svw", height: "100svh", overflow: "hidden", background: ut.canvasBg, fontFamily: "Inter, sans-serif", cursor: spotlightActive ? "crosshair" : "default", touchAction: "none", userSelect: "none" }}
                onMouseMove={e => {
                    const rect = canvasRef.current!.getBoundingClientRect();
                    setHoverScreenY(e.clientY - rect.top);
                    // Spotlight: update gradient center directly — no React re-render
                    if (spotlightActiveRef.current && spotlightRef.current) {
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        spotlightRef.current.style.background = `radial-gradient(circle 180px at ${x}px ${y}px, transparent 0%, transparent 179px, rgba(0,0,0,0.65) 180px)`;
                    }
                }}
                onMouseLeave={() => {
                    setHoverScreenY(null);
                    if (spotlightActiveRef.current) { spotlightActiveRef.current = false; setSpotlightActive(false); }
                }}
                onMouseDown={e => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    // Left-click hold → spotlight mode
                    spotlightActiveRef.current = true;
                    setSpotlightActive(true);
                    if (spotlightRef.current) {
                        const rect = canvasRef.current!.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        spotlightRef.current.style.background = `radial-gradient(circle 180px at ${x}px ${y}px, transparent 0%, transparent 179px, rgba(0,0,0,0.65) 180px)`;
                        spotlightRef.current.style.opacity = "1";
                    }
                }}
                onMouseUp={e => {
                    if (e.button !== 0) return;
                    if (spotlightActiveRef.current) {
                        spotlightActiveRef.current = false;
                        setSpotlightActive(false);
                        if (spotlightRef.current) spotlightRef.current.style.opacity = "0";
                        return; // don't fire click highlight when releasing spotlight
                    }
                }}
                onClick={e => {
                    if (!spotlightActiveRef.current) handlePresenterClick(e);
                }}
                onWheel={e => {
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) {
                        const rect = canvasRef.current!.getBoundingClientRect();
                        const ox = e.clientX - (rect.left + rect.width / 2);
                        const oy = e.clientY - (rect.top + rect.height / 2);
                        // 10x smoother: speed-based instead of fixed multiplier
                        const speed = e.deltaMode === 1 ? 0.018 : 0.0012;
                        const oldZoom = zoomRef.current;
                        const newZoom = parseFloat(Math.min(4, Math.max(0.2, oldZoom - e.deltaY * speed * oldZoom)).toFixed(4));
                        const ratio = newZoom / oldZoom;
                        zoomRef.current = newZoom;
                        panRef.current = { x: ox * (1 - ratio) + panRef.current.x * ratio, y: oy * (1 - ratio) + panRef.current.y * ratio };
                        applyTransform(panRef.current, newZoom);
                    } else {
                        panRef.current = { x: panRef.current.x - e.deltaX, y: panRef.current.y - e.deltaY };
                        applyTransform(panRef.current, zoomRef.current);
                    }
                    if (viewWheelTimer.current) clearTimeout(viewWheelTimer.current);
                    viewWheelTimer.current = setTimeout(() => { syncTransformState(); setFitActive(false); }, 150);
                }}
            >
                {/* Hover row highlight */}
                {hoverScreenY !== null && !spotlightActive && (
                    <div style={{
                        position: "absolute", left: 0, right: 0, pointerEvents: "none", zIndex: 5,
                        top: Math.round(hoverScreenY / stepHeight) * stepHeight - stepHeight / 2,
                        height: stepHeight,
                        background: "rgba(120,220,232,0.07)",
                        borderTop: "1px solid rgba(120,220,232,0.18)",
                        borderBottom: "1px solid rgba(120,220,232,0.18)",
                        transition: "top 0.12s ease",
                    }} />
                )}

                {mounted && activeSvg && (
                    <div ref={svgWrapRef} style={{ position: "absolute", top: "50%", left: "50%", cursor: "default" }}
                        dangerouslySetInnerHTML={{ __html: activeSvg }}
                    />
                )}

                {/* Spotlight overlay — updated directly via DOM, no React re-renders */}
                <div ref={spotlightRef} style={{
                    position: "absolute", inset: 0, zIndex: 16, pointerEvents: "none",
                    opacity: 0, transition: "opacity 0.15s ease",
                    background: "radial-gradient(circle 180px at 50% 50%, transparent 0%, transparent 179px, rgba(0,0,0,0.65) 180px)",
                }} />

                {/* Esc-pending toast */}
                {presenterEscPending && (
                    <div style={{
                        position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)",
                        background: "rgba(20,20,30,0.88)", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12, color: "#f8fafc", fontSize: 13, fontWeight: 600,
                        padding: "8px 20px", zIndex: 30, backdropFilter: "blur(8px)",
                        pointerEvents: "none", letterSpacing: "0.02em",
                    }}>
                        Press Esc again to exit presenter
                    </div>
                )}

                {/* Minimal zoom bar */}
                <div style={{
                    position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
                    background: ut.zoomBg, border: `1px solid ${ut.zoomBorder}`, borderRadius: 14,
                    padding: "0 4px", display: "flex", alignItems: "center", gap: 0,
                    boxShadow: "0 2px 20px rgba(0,0,0,0.18)", zIndex: 20,
                }}>
                    <button onClick={() => { const nz = parseFloat(Math.max(0.2, zoom - 0.15).toFixed(2)); zoomRef.current = nz; applyTransform(panRef.current, nz); setZoom(nz); setFitActive(false); }} style={{ color: ut.zoomMuted, fontSize: 22, lineHeight: 1, background: "none", border: "none", cursor: "pointer", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <span style={{ color: ut.zoomText, fontSize: 12, fontWeight: 600, minWidth: 44, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
                    <button onClick={() => { const nz = parseFloat(Math.min(4, zoom + 0.15).toFixed(2)); zoomRef.current = nz; applyTransform(panRef.current, nz); setZoom(nz); setFitActive(false); }} style={{ color: ut.zoomMuted, fontSize: 22, lineHeight: 1, background: "none", border: "none", cursor: "pointer", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                    <div style={{ width: 1, height: 20, background: ut.zoomDivider, margin: "0 4px" }} />
                    <button onClick={fitZoom} style={{ color: fitActive ? ut.accent : ut.zoomMuted, fontSize: 11, fontWeight: 700, background: "none", border: "none", cursor: "pointer", letterSpacing: "0.04em", height: 44, padding: "0 12px" }}>Fit</button>
                    <div style={{ width: 1, height: 20, background: ut.zoomDivider, margin: "0 4px" }} />
                    <button onClick={exitPresenter} style={{ color: "#f43f5e", fontSize: 11, fontWeight: 700, background: "none", border: "none", cursor: "pointer", letterSpacing: "0.04em", height: 44, padding: "0 12px" }}>✕ Exit</button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>
            <style>{`
                ${opts.theme === "light" ? `
                .token.comment     { color: #6e7781; font-style: italic; }
                .token.keyword     { color: #cf222e; font-weight: 600; }
                .token.arrow       { color: #0969da; }
                .token.string      { color: #0a3069; }
                .token.number      { color: #8250df; }
                .token.operator    { color: #953800; }
                .token.punctuation { color: #6e7781; }
                ` : `
                .token.comment     { color: #727072; font-style: italic; }
                .token.keyword     { color: #FF6188; font-weight: 600; }
                .token.arrow       { color: #78DCE8; }
                .token.string      { color: #FFD866; }
                .token.number      { color: #AB9DF2; }
                .token.operator    { color: #FC9867; }
                .token.punctuation { color: #727072; }
                `}
                input[type="range"] { background: ${ut.divider}; }
                input[type="range"]::-webkit-slider-thumb { background: ${ut.accent}; }
                input[type="range"]::-moz-range-thumb { background: ${ut.accent}; border: none; }
                input[type="range"]::-moz-range-track { background: ${ut.divider}; }
                input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.35); }
                .npm__react-simple-code-editor__textarea { outline: none !important; }
                @keyframes rainbow-pp {
                    0%   { color: #FF6188; }
                    16%  { color: #FC9867; }
                    33%  { color: #FFD866; }
                    50%  { color: #A9DC76; }
                    66%  { color: #78DCE8; }
                    83%  { color: #AB9DF2; }
                    100% { color: #FF6188; }
                }
                .rainbow-pp { animation: rainbow-pp 2.5s linear infinite; font-weight: 900; }
            `}</style>

            {/* ── HEADER ── */}
            <header className="flex items-center px-4 shrink-0"
                style={{ height: 54, background: ut.headerBg, borderBottom: `1px solid ${ut.headerBorder}` }}>
                <span className="font-bold text-[16px] tracking-tight" style={{ color: ut.headerText, letterSpacing: "-0.3px" }}>
                    Mermaid<span className="rainbow-pp">++</span>
                </span>
                {diagramType !== "sequence" && (
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: ut.badgeBg,
                        color: ut.badgeText, borderRadius: 6, padding: "2px 7px", textTransform: "uppercase",
                        letterSpacing: "0.08em" }}>
                        {diagramType}
                    </span>
                )}
                <div className="flex-1" />
                <div className="flex gap-2">
<IconBtn active={showCode} accent={ut.accent} inactiveBg={opts.theme === "light" ? "rgba(255,255,255,0.12)" : ut.activeTab} color={ut.headerText} onClick={() => { setShowCode(v => !v); if (showSettings) setShowSettings(false); }}>
                        <Code2 size={20} strokeWidth={2} />
                    </IconBtn>
                    <IconBtn active={showSettings} accent={ut.accent} inactiveBg={opts.theme === "light" ? "rgba(255,255,255,0.12)" : ut.activeTab} color={ut.headerText} onClick={() => { setShowSettings(v => !v); if (showCode && isMobile) setShowCode(false); }}>
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
                                background: ut.codeBg,
                                borderColor: ut.codeBorder,
                            }}>
                            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                                style={{
                                    borderColor: ut.codeBorder,
                                    background: ut.codeHeaderBg,
                                }}>
                                <span className="text-[9px] font-bold uppercase tracking-widest"
                                    style={{ color: ut.zoomMuted }}>Code</span>
                                <div className="flex items-center gap-1">
                                    <button onClick={copyCode} title="Copy code"
                                        className="h-6 px-2 rounded flex items-center justify-center text-[10px] font-semibold transition-all"
                                        style={{ color: copied ? ut.toggleOn : ut.zoomMuted, background: copied ? `${ut.toggleOn}22` : "transparent" }}
                                    >{copied ? "Copied" : "Copy"}</button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
                                <Editor
                                    value={code}
                                    onValueChange={setCode}
                                    highlight={highlight}
                                    padding={16}
                                    spellCheck={false}
                                    onPaste={handlePaste}
                                    style={{
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        fontSize: "9px",
                                        lineHeight: 1.75,
                                        minHeight: "100%",
                                        color: ut.codeText,
                                    }}
                                />
                            </div>
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
                                style={{ background: ut.codeBorder }} />
                        </div>
                    </div>
                )}

                {/* ── Diagram canvas ── */}
                <div className="flex-1 relative" style={{ background: ut.canvasBg }}>
                    <div ref={canvasRef} className="absolute inset-0 overflow-hidden"
                        style={{ cursor: isPanning ? "grabbing" : "grab", touchAction: "none" }}
                        onMouseDown={e => {
                            if ((e.target as HTMLElement).closest("button,#diagram-title")) return;
                            isDragging.current = true;
                            setIsPanning(true);
                            dragStartMouse.current = { x: e.clientX, y: e.clientY };
                            dragStartPan.current = { x: panRef.current.x, y: panRef.current.y };
                            e.preventDefault();
                        }}
                        onDoubleClick={e => {
                            if ((e.target as HTMLElement).closest("#diagram-title")) return;
                        }}
                    >
                        {mounted && activeSvg ? (
                            <div
                                ref={svgWrapRef}
                                style={{
                                    position: "absolute",
                                    top: "50%", left: "50%",
                                }}
                                onClick={e => {
                                    const el = (e.target as Element).closest("#diagram-title");
                                    if (el) { setTitleEdit({ value: diagram.title ?? DEFAULT_DIAGRAM_TITLE, rect: el.getBoundingClientRect() }); }
                                }}
                                dangerouslySetInnerHTML={{ __html: activeSvg }}
                            />
                        ) : mounted && !activeSvg && !isSequence ? (
                            <div style={{ color: ut.zoomMuted, position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
                                Rendering…
                            </div>
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

                    {/* Title inline editor overlay */}
                    {titleEdit && (
                        <input
                            autoFocus
                            value={titleEdit.value}
                            onChange={e => setTitleEdit(t => t ? { ...t, value: e.target.value } : null)}
                            onBlur={e => commitTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") commitTitle((e.target as HTMLInputElement).value); if (e.key === "Escape") setTitleEdit(null); }}
                            style={{
                                position: "fixed",
                                left: titleEdit.rect.left,
                                top: titleEdit.rect.top,
                                width: Math.max(titleEdit.rect.width, 220),
                                height: titleEdit.rect.height || 36,
                                fontSize: 30 * zoom,
                                fontWeight: 800,
                                fontFamily: `'${opts.font}', sans-serif`,
                                color: (UI_THEMES[opts.theme] ?? UI_THEMES.light).bodyText,
                                background: "transparent",
                                border: "none",
                                borderBottom: `2px solid ${(UI_THEMES[opts.theme] ?? UI_THEMES.light).accent}`,
                                outline: "none",
                                padding: 0,
                                lineHeight: 1,
                                zIndex: 100,
                            }}
                        />
                    )}

                    {/* Zoom toolbar */}
                    {mounted && (
                        <div
                            className="absolute bottom-4 z-10 flex items-center"
                            style={{
                                left: "50%", transform: "translateX(-50%)",
                                background: ut.zoomBg,
                                border: `1px solid ${ut.zoomBorder}`,
                                borderRadius: 12,
                                padding: isMobile ? "4px 8px" : "3px 10px",
                                boxShadow: "0 2px 16px rgba(0,0,0,0.12)",
                                gap: isMobile ? 0 : 2,
                                whiteSpace: "nowrap",
                            }}
                        >
                            <button
                                onClick={() => { const nz = parseFloat(Math.max(0.2, zoom - 0.1).toFixed(2)); zoomRef.current = nz; applyTransform(panRef.current, nz); setZoom(nz); setFitActive(false); }}
                                className="flex items-center justify-center rounded hover:bg-black/5 transition-all"
                                style={{ width: isMobile ? 38 : 24, height: isMobile ? 38 : 24, color: ut.zoomMuted, fontSize: isMobile ? 22 : 18, lineHeight: 1 }}
                            >−</button>

                            <span style={{ color: ut.zoomText, fontSize: isMobile ? 13 : 11, fontWeight: 600, minWidth: isMobile ? 48 : 38, textAlign: "center" }}>
                                {zoomPct}%
                            </span>

                            <button
                                onClick={() => { const nz = parseFloat(Math.min(4, zoom + 0.1).toFixed(2)); zoomRef.current = nz; applyTransform(panRef.current, nz); setZoom(nz); setFitActive(false); }}
                                className="flex items-center justify-center rounded hover:bg-black/5 transition-all"
                                style={{ width: isMobile ? 38 : 24, height: isMobile ? 38 : 24, color: ut.zoomMuted, fontSize: isMobile ? 22 : 18, lineHeight: 1 }}
                            >+</button>

                            <div style={{ width: 1, height: 14, background: ut.zoomDivider, margin: isMobile ? "0 6px" : "0 6px" }} />

                            {/* Desktop: preset zoom buttons */}
                            {!isMobile && [50, 75, 100, 150, 200].map(p => (
                                <button
                                    key={p}
                                    onClick={() => { const nz = p / 100; zoomRef.current = nz; applyTransform(panRef.current, nz); setZoom(nz); setFitActive(false); }}
                                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold transition-all hover:bg-black/5"
                                    style={{
                                        color: !fitActive && zoomPct === p ? ut.accent : ut.zoomMuted,
                                        background: !fitActive && zoomPct === p ? `${ut.accent}14` : "transparent",
                                    }}
                                >{p}%</button>
                            ))}

                            {!isMobile && <div style={{ width: 1, height: 14, background: ut.zoomDivider, margin: "0 6px" }} />}

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
                                    color: fitActive ? ut.accent : ut.zoomMuted,
                                    background: fitActive ? `${ut.accent}14` : "transparent",
                                    letterSpacing: "0.04em",
                                }}
                            >Fit</button>

                            {!isMobile && <>
                                <div style={{ width: 1, height: 14, background: ut.zoomDivider, margin: "0 6px" }} />
                                <div style={{ position: "relative" }}>
                                    <button
                                        onClick={() => setShowShortcuts(v => !v)}
                                        className="flex items-center justify-center rounded hover:bg-black/5 transition-all"
                                        style={{ width: 20, height: 20, fontSize: 10, fontWeight: 700, color: showShortcuts ? ut.accent : ut.zoomMuted, border: `1px solid ${showShortcuts ? ut.accent : ut.zoomBorder}`, borderRadius: "50%", lineHeight: 1 }}
                                    >?</button>
                                    {showShortcuts && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                bottom: "calc(100% + 10px)",
                                                right: 0,
                                                background: ut.zoomBg,
                                                border: `1px solid ${ut.zoomBorder}`,
                                                borderRadius: 10,
                                                boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
                                                padding: "12px 14px",
                                                minWidth: 220,
                                                zIndex: 50,
                                            }}
                                        >
                                            <div style={{ fontSize: 10, fontWeight: 700, color: ut.zoomMuted, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>Keyboard Shortcuts</div>
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
                                                    <code style={{ fontSize: 10, background: ut.activeTab, color: ut.zoomText, padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", whiteSpace: "nowrap" }}>{key}</code>
                                                    <span style={{ fontSize: 11, color: ut.zoomMuted }}>{desc}</span>
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
                    <div className="shrink-0 flex flex-col" style={{ width: 268, background: ut.panelBg, borderLeft: `1px solid ${ut.panelBorder}` }}>
                            <div className="flex-1 overflow-y-auto" style={{ padding: "12px 12px" }}>
                            <SettingsContent opts={opts} layout={computedLayout} copied={copied} copiedLink={copiedLink} copiedShare={copiedShare} participants={diagram.participants} isSequence={isSequence}
                                upd={upd} updL={updL} exportPng={exportPng} exportCode={exportCode} exportJson={exportJson} copyCode={copyCode} copyLink={copyLink} share={share} viewUrl={mounted ? buildViewUrl() : ""} onPresent={enterPresenter} />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Mobile: Code editor full-screen overlay ── */}
            {isMobile && showCode && (
                <div className="fixed inset-0 z-50 flex flex-col" style={{ background: ut.codeBg }}>
                    <div className="flex items-center justify-between px-4 shrink-0"
                        style={{ height: 54, background: ut.codeHeaderBg, borderBottom: `1px solid ${ut.codeBorder}` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: ut.zoomMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            Code Editor
                        </span>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={copyCode}
                                style={{ fontSize: 13, fontWeight: 600, color: copied ? ut.toggleOn : ut.zoomMuted, padding: "6px 0" }}
                            >{copied ? "Copied!" : "Copy"}</button>
                            <button
                                onClick={() => setShowCode(false)}
                                className="w-9 h-9 rounded-full flex items-center justify-center"
                                style={{ background: ut.activeTab, color: ut.zoomMuted }}>
                                <X size={16} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
                        <Editor
                            value={code}
                            onValueChange={setCode}
                            highlight={highlight}
                            padding={16}
                            spellCheck={false}
                            onPaste={handlePaste}
                            style={{
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: "11px",
                                lineHeight: 1.8,
                                minHeight: "100%",
                                color: ut.codeText,
                            }}
                        />
                    </div>
                    {/* Done button */}
                    <div className="shrink-0 px-4 py-3" style={{ borderTop: `1px solid ${ut.codeBorder}`, background: ut.codeHeaderBg }}>
                        <button
                            onClick={() => setShowCode(false)}
                            className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                            style={{ background: ut.accent, color: "white" }}
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
                        style={{ background: ut.panelBg, maxHeight: "84vh" }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Pull handle */}
                        <div className="flex justify-center pt-3 pb-1 shrink-0">
                            <div style={{ width: 36, height: 4, background: ut.pullHandle, borderRadius: 2 }} />
                        </div>
                        {/* Sheet content */}
                        <div className="flex-1 overflow-y-auto" style={{ padding: "20px 20px 40px" }}>
                            <SettingsContent opts={opts} layout={layout} copied={copied} copiedLink={copiedLink} copiedShare={copiedShare} mobile={true} participants={diagram.participants} isSequence={isSequence}
                                upd={upd} updL={updL} exportPng={exportPng} exportCode={exportCode} exportJson={exportJson} copyCode={copyCode} copyLink={copyLink} share={share} viewUrl={mounted ? buildViewUrl() : ""} onPresent={enterPresenter} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
