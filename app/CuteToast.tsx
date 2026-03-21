"use client";
import { useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';

export interface ToastOptions {
  color?: string;
  confetti?: boolean;
}

interface ToastState {
  id: number;
  msg: string;
  color: string;
  confetti: boolean;
}

type Listener = (state: ToastState | null) => void;
const listeners = new Set<Listener>();
let _id = 0;

export function showToast(msg: string, { color = '#6366f1', confetti = false }: ToastOptions = {}) {
  const state: ToastState = { id: ++_id, msg, color, confetti };
  listeners.forEach(fn => fn(state));
}

const KEYFRAMES = `
@keyframes cuteToastInOut {
  0%   { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.72); }
  14%  { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  82%  { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.78); }
}
@keyframes cuteConfetti {
  0%   { transform: translate(0, 0) scale(0); opacity: 1; }
  60%  { transform: translate(var(--cx), var(--cy)) scale(1); opacity: 1; }
  100% { transform: translate(var(--cx), var(--cy)) scale(0); opacity: 0; }
}
@keyframes cuteSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;

export function CuteToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (state: ToastState | null) => {
      setToast(state);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (state) timerRef.current = setTimeout(() => setToast(null), 5000);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (!toast) return <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />;

  const cx = typeof window !== 'undefined' ? window.innerWidth / 2 : 200;
  const cy = 28;
  const confettiColors = [toast.color, '#ffffff', '#FFD700', '#a78bfa', '#34d399', '#f472b6'];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {toast.confetti && Array.from({ length: 18 }).map((_, i) => {
        const angle = (i / 18) * 360;
        const dist = 44 + (i % 5) * 14;
        const size = 4 + (i % 4);
        const tx = Math.round(cx + Math.cos(angle * Math.PI / 180) * dist);
        const ty = Math.round(cy + Math.sin(angle * Math.PI / 180) * dist);
        return (
          <div key={`${toast.id}-${i}`} style={{
            position: 'fixed', zIndex: 100003, pointerEvents: 'none',
            borderRadius: 2, width: size, height: size, left: cx, top: cy,
            background: confettiColors[i % confettiColors.length],
            animation: `cuteConfetti 1.2s cubic-bezier(0.2,1,0.3,1) ${i * 45}ms both`,
            ['--cx' as string]: `${tx - cx}px`,
            ['--cy' as string]: `${ty - cy}px`,
          }} />
        );
      })}

      <div key={toast.id} style={{
        position: 'fixed', left: '50%', top: 8, zIndex: 100002,
        pointerEvents: 'none',
        animation: 'cuteToastInOut 5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 999,
          background: toast.color,
          border: `1px solid ${toast.color}99`,
          boxShadow: `0 8px 26px ${toast.color}66`,
          color: '#fff',
        }}>
          <span style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={12} strokeWidth={2} color="#fff" />
          </span>
          <span style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 8, fontWeight: 900, letterSpacing: '0.08em',
            textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap',
          }}>
            {toast.msg}
          </span>
        </div>
      </div>
    </>
  );
}
