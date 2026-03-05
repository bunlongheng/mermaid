/**
 * Smoke test — verifies the actor keyword fix and prod availability
 * Run: node smoke-test.mjs
 */

import https from "https";

const PROD = "https://mermaid-bheng.vercel.app";

// Node https wrapper that follows redirects
function httpGet(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        function doGet(u, hops) {
            https.get(u, { timeout: 10000, rejectUnauthorized: false }, res => {
                if ([301,302,307,308].includes(res.statusCode) && res.headers.location && hops > 0) {
                    const next = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, u).href;
                    res.resume();
                    return doGet(next, hops - 1);
                }
                let body = "";
                res.on("data", c => body += c);
                res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
            }).on("error", reject).on("timeout", () => reject(new Error("timeout")));
        }
        doGet(url, maxRedirects);
    });
}

// ── Replicate parse() exactly as in app/page.tsx ─────────────────────────────
function parse(code) {
    const participants = [];
    const map = new Map();
    const messages = [];
    let step = 0, ci = 0;
    let title;
    function addP(id, label) {
        if (!map.has(id)) {
            const p = { id, color: "#000", label: (label ?? id).replace(/\[(.+?)\]/g, "($1)") };
            participants.push(p); map.set(id, p);
        }
    }
    for (const raw of code.split("\n")) {
        const l = raw.trim();
        if (!l || /^(%%|sequenceDiagram|autonumber|---|```)/.test(l)) continue;
        const tm = l.match(/^title:\s*(.+)$/i);
        if (tm) { title = tm[1].trim(); continue; }
        // THE FIX: (?:participant|actor)
        const pm = l.match(/^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i);
        if (pm) { addP(pm[1], pm[2]); continue; }
        const mm = l.match(/^(\w+)\s*(-->>|->>|-->|->)\s*(\w+):\s*(.*)$/);
        if (mm) {
            const [, fId, arr, tId, rawText] = mm;
            addP(fId); addP(tId);
            messages.push({ from: fId, to: tId, text: rawText.trim(), arrow: arr.startsWith("--") ? "dashed" : "solid", step: ++step });
        }
    }
    return { participants, messages, title };
}

// ── Test helpers ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(label, condition, detail = "") {
    if (condition) {
        console.log(`  ✓  ${label}`);
        passed++;
    } else {
        console.error(`  ✗  ${label}${detail ? " — " + detail : ""}`);
        failed++;
    }
}

// ── Unit tests: parse() ───────────────────────────────────────────────────────
console.log("\n── Unit: actor keyword fix ──────────────────────────────────────");

{
    const code = `sequenceDiagram
actor U as Bunlong
participant CC as Claude Code
participant GDB as Global Rules DB
U->>CC: opens ~/Sites/3pi
CC->>GDB: fetch rules`;
    const d = parse(code);
    const ids = d.participants.map(p => p.id);
    assert("actor U declared first → index 0", ids[0] === "U", `got: ${ids[0]}`);
    assert("CC at index 1",  ids[1] === "CC",  `got: ${ids[1]}`);
    assert("GDB at index 2", ids[2] === "GDB", `got: ${ids[2]}`);
    assert("actor label resolved", d.participants[0].label === "Bunlong", `got: ${d.participants[0].label}`);
    assert("no duplicate U", ids.filter(x => x === "U").length === 1, `count: ${ids.filter(x => x==="U").length}`);
}

console.log("\n── Unit: old participant keyword still works ─────────────────────");
{
    const code = `sequenceDiagram
participant A as Alice
participant B as Bob
A->>B: hello`;
    const d = parse(code);
    const ids = d.participants.map(p => p.id);
    assert("participant A at index 0", ids[0] === "A");
    assert("participant B at index 1", ids[1] === "B");
}

console.log("\n── Unit: auto-discovery (no declarations) ────────────────────────");
{
    const code = `sequenceDiagram
X->>Y: ping
Y-->>X: pong`;
    const d = parse(code);
    assert("X discovered first", d.participants[0].id === "X");
    assert("Y discovered second", d.participants[1].id === "Y");
    assert("2 messages", d.messages.length === 2);
}

console.log("\n── Unit: actor mixed with participant ────────────────────────────");
{
    const code = `sequenceDiagram
actor User
participant API as Backend API
participant DB
User->>API: request
API->>DB: query`;
    const d = parse(code);
    const ids = d.participants.map(p => p.id);
    assert("User first", ids[0] === "User");
    assert("API second", ids[1] === "API");
    assert("DB third", ids[2] === "DB");
    assert("API label", d.participants[1].label === "Backend API");
}

// ── Prod smoke: HTTP checks ───────────────────────────────────────────────────
console.log("\n── Prod: " + PROD + " ────────────────────────────────────────────");

async function checkUrl(path, expectStatus = 200) {
    try {
        const res = await httpGet(PROD + path);
        assert(`GET ${path} → ${expectStatus}`, res.status === expectStatus, `got ${res.status}`);
        return res;
    } catch (e) {
        assert(`GET ${path}`, false, e.message);
    }
}

async function checkContentType(path, type) {
    try {
        const res = await httpGet(PROD + path);
        const ct = res.headers["content-type"] ?? "";
        assert(`GET ${path} content-type contains "${type}"`, ct.includes(type), `got: ${ct}`);
    } catch (e) {
        assert(`GET ${path} content-type`, false, e.message);
    }
}

const res = await checkUrl("/");
if (res) {
    assert("page contains Mermaid",       res.body.includes("Mermaid"));
    assert("page has <html>",             res.body.includes("<html") || res.body.includes("<!DOCTYPE"));
    assert("manifest linked",             res.body.includes("manifest"));
}

await checkUrl("/manifest.webmanifest");
await checkUrl("/icon.svg");
await checkUrl("/icon");
await checkUrl("/apple-icon");
await checkUrl("/icon-192");
await checkUrl("/icon-512");
await checkUrl("/opengraph-image");

await checkContentType("/manifest.webmanifest", "json");
await checkContentType("/icon.svg",             "svg");
await checkContentType("/icon",                 "image/png");
await checkContentType("/icon-192",             "image/png");
await checkContentType("/icon-512",             "image/png");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n── Result: ${passed} passed, ${failed} failed ` + (failed ? "❌" : "✓") + " ─────────────────\n");
process.exit(failed > 0 ? 1 : 0);
