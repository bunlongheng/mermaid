import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
    const isLocal = process.env.NEXT_PUBLIC_LOCAL_DEV === "true";
    const bg  = isLocal ? "linear-gradient(135deg, #2a2a2a 0%, #555 100%)" : "linear-gradient(135deg, #1e0a3c 0%, #4c1d95 100%)";
    const c1  = isLocal ? "#aaa" : "#fb7185";
    const c2  = isLocal ? "#888" : "#34d399";
    const c3  = isLocal ? "#bbb" : "#fbbf24";
    const c4  = isLocal ? "#999" : "#a78bfa";

    return new ImageResponse(
        (
            <div style={{
                background: bg, width: "100%", height: "100%", borderRadius: "22%",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: "3px", padding: "4px",
            }}>
                <div style={{ display: "flex", gap: "7px" }}>
                    <div style={{ width: 9, height: 7, background: c1, borderRadius: 2 }} />
                    <div style={{ width: 9, height: 7, background: c2, borderRadius: 2 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: 17, height: 2, background: c3 }} />
                    <div style={{ width: 0, height: 0, borderTop: "3px solid transparent", borderBottom: "3px solid transparent", borderLeft: `4px solid ${c3}` }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", flexDirection: "row-reverse" }}>
                    <div style={{ width: 17, height: 2, background: c4 }} />
                    <div style={{ width: 0, height: 0, borderTop: "3px solid transparent", borderBottom: "3px solid transparent", borderRight: `4px solid ${c4}` }} />
                </div>
            </div>
        ),
        { ...size }
    );
}
