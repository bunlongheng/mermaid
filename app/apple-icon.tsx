import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#111113",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "40px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
          }}
        >
          {/* Top row: two participant boxes with arrow */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Left box */}
            <div
              style={{
                width: 48,
                height: 24,
                background: "#3b82f6",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
            {/* Arrow */}
            <div
              style={{
                width: 30,
                height: 3,
                background: "#ef4444",
                borderRadius: 2,
              }}
            />
            {/* Right box */}
            <div
              style={{
                width: 48,
                height: 24,
                background: "#22c55e",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
          </div>

          {/* Message rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Row 1: left dot + line going right */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: 14, height: 14, background: "#ef4444", borderRadius: "50%" }} />
              <div style={{ width: 100, height: 2, background: "#ef4444", borderRadius: 2 }} />
              <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: "10px solid #ef4444" }} />
            </div>
            {/* Row 2: right dot + dashed line going left */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "flex-end" }}>
              <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderRight: "10px solid #8b5cf6" }} />
              <div style={{ width: 100, height: 2, background: "#8b5cf6", borderRadius: 2, opacity: 0.7 }} />
              <div style={{ width: 14, height: 14, background: "#8b5cf6", borderRadius: "50%" }} />
            </div>
            {/* Row 3: left dot + line going right */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: 14, height: 14, background: "#f97316", borderRadius: "50%" }} />
              <div style={{ width: 100, height: 2, background: "#f97316", borderRadius: 2 }} />
              <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: "10px solid #f97316" }} />
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
