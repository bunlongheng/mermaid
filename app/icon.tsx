import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#111113",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
          gap: "3px",
          padding: "4px",
        }}
      >
        {/* Top: two boxes */}
        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          <div style={{ width: 9, height: 7, background: "#3b82f6", borderRadius: 2 }} />
          <div style={{ width: 6, height: 1.5, background: "#f97316" }} />
          <div style={{ width: 9, height: 7, background: "#22c55e", borderRadius: 2 }} />
        </div>
        {/* Middle: arrow lines */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <div style={{ width: 3, height: 3, background: "#ef4444", borderRadius: "50%" }} />
          <div style={{ width: 18, height: 1.5, background: "#ef4444" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "2px", justifyContent: "flex-end" }}>
          <div style={{ width: 18, height: 1.5, background: "#8b5cf6", opacity: 0.8 }} />
          <div style={{ width: 3, height: 3, background: "#8b5cf6", borderRadius: "50%" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
