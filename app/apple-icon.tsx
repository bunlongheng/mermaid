import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
    const isLocal = process.env.NEXT_PUBLIC_LOCAL_DEV === "true";
    const bg = isLocal ? "linear-gradient(135deg, #1a1a1a 0%, #444 55%, #222 100%)" : "linear-gradient(135deg, #0f051e 0%, #2e0f6b 55%, #0c2340 100%)";
    const P1 = isLocal ? "#888" : "#fb7185";
    const P2 = isLocal ? "#666" : "#a78bfa";
    const P3 = isLocal ? "#777" : "#34d399";
    const A1 = isLocal ? "#999" : "#fbbf24";
    const A2 = isLocal ? "#888" : "#38bdf8";

    return new ImageResponse(
        (
            <div style={{
                background: bg,
                width: "100%",
                height: "100%",
                display: "flex",
                position: "relative",
            }}>
                {/* Participant boxes */}
                <div style={{ position: "absolute", top: 24, left: 18, width: 44, height: 26, background: P1, borderRadius: 7, display: "flex" }} />
                <div style={{ position: "absolute", top: 24, left: 68, width: 44, height: 26, background: P2, borderRadius: 7, display: "flex" }} />
                <div style={{ position: "absolute", top: 24, left: 118, width: 44, height: 26, background: P3, borderRadius: 7, display: "flex" }} />

                {/* Lifelines */}
                <div style={{ position: "absolute", top: 50, left: 40, width: 2, height: 110, background: "rgba(251,113,133,0.3)", display: "flex" }} />
                <div style={{ position: "absolute", top: 50, left: 90, width: 2, height: 110, background: "rgba(167,139,250,0.3)", display: "flex" }} />
                <div style={{ position: "absolute", top: 50, left: 140, width: 2, height: 110, background: "rgba(52,211,153,0.3)", display: "flex" }} />

                {/* Arrow 1: P1 → P2 (amber) */}
                <div style={{ position: "absolute", top: 73, left: 42, width: 46, height: 2, background: A1, display: "flex" }} />
                <div style={{ position: "absolute", top: 69, left: 84, width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `10px solid ${A1}`, display: "flex" }} />

                {/* Arrow 2: P2 → P3 (sky) */}
                <div style={{ position: "absolute", top: 98, left: 92, width: 46, height: 2, background: A2, display: "flex" }} />
                <div style={{ position: "absolute", top: 94, left: 134, width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `10px solid ${A2}`, display: "flex" }} />

                {/* Arrow 3: P3 → P2 return (violet dashed — 3 segments) */}
                <div style={{ position: "absolute", top: 123, left: 93, width: 12, height: 2, background: P2, opacity: 0.9, display: "flex" }} />
                <div style={{ position: "absolute", top: 123, left: 111, width: 12, height: 2, background: P2, opacity: 0.9, display: "flex" }} />
                <div style={{ position: "absolute", top: 123, left: 129, width: 8, height: 2, background: P2, opacity: 0.9, display: "flex" }} />
                <div style={{ position: "absolute", top: 119, left: 86, width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderRight: `10px solid ${P2}`, display: "flex" }} />

                {/* Arrow 4: P2 → P1 return (rose dashed) */}
                <div style={{ position: "absolute", top: 148, left: 43, width: 12, height: 2, background: P1, opacity: 0.9, display: "flex" }} />
                <div style={{ position: "absolute", top: 148, left: 61, width: 12, height: 2, background: P1, opacity: 0.9, display: "flex" }} />
                <div style={{ position: "absolute", top: 148, left: 79, width: 8, height: 2, background: P1, opacity: 0.9, display: "flex" }} />
                <div style={{ position: "absolute", top: 144, left: 36, width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderRight: `10px solid ${P1}`, display: "flex" }} />
            </div>
        ),
        { ...size }
    );
}
