"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  code: string;
  dark?: boolean;
}

export default function MermaidRenderer({ code, dark = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code.trim() || !ref.current) return;
    let cancelled = false;

    async function render() {
      const mermaid = (await import("mermaid")).default;

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "Inter, system-ui, sans-serif",
        theme: "base",
        themeVariables: dark ? {
          primaryColor: "#2a2d3a",
          primaryTextColor: "#e2e8f0",
          primaryBorderColor: "#3f4354",
          lineColor: "#64748b",
          secondaryColor: "#1e2130",
          tertiaryColor: "#252836",
          background: "#151720",
          mainBkg: "#1e2130",
          nodeBorder: "#3f4354",
          clusterBkg: "#1a1d2e",
          titleColor: "#e2e8f0",
          edgeLabelBackground: "#1e2130",
          fontFamily: "Inter, system-ui, sans-serif",
        } : {
          primaryColor: "#f8fafc",
          primaryTextColor: "#1c1e21",
          primaryBorderColor: "#e2e8f0",
          lineColor: "#94a3b8",
          secondaryColor: "#f1f5f9",
          tertiaryColor: "#e8edf5",
          background: "#ffffff",
          mainBkg: "#f8fafc",
          nodeBorder: "#cbd5e1",
          clusterBkg: "#f1f5f9",
          titleColor: "#1c1e21",
          edgeLabelBackground: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "14px",
        },
      });

      try {
        const id = `mm-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          const svgEl = ref.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("width");
            svgEl.removeAttribute("height");
            svgEl.style.width = "100%";
            svgEl.style.height = "100%";
            svgEl.style.maxWidth = "100%";
          }
          setError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Render error");
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code, dark]);

  if (error) return (
    <div style={{ padding: 24, color: "#ef4444", fontSize: 13, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
      {error}
    </div>
  );

  return <div ref={ref} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }} />;
}
