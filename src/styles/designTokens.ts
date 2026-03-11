// src/styles/designTokens.ts — Shared design tokens for inline-styled pages
// CSS variables are defined in index.css and must be used for backgrounds,
// borders, and text colors. Feature accent hex is allowed per the design system.

import type { CSSProperties } from 'react';

/* ─── Hex → rgba helper ──────────────────────────────────────────────── */
export const h2r = (hex: string, a: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

/* ─── Feature accent colours (hex allowed) ───────────────────────────── */
export const ACCENT_COLORS = {
  dashboard:   '#6C63FF',
  essays:      '#A855F7',
  activities:  '#10B981',
  academics:   '#3B9EFF',
  preferences: '#F97316',
  goals:       '#F59E0B',
  danger:      '#F87171',
} as const;

/* ─── Shared design token object (CSS variable references) ───────────── */
export const S = {
  bg:       'var(--color-bg-primary)',
  surface:  'var(--color-bg-surface)',
  elevated: 'var(--color-bg-elevated)',
  surface2: 'var(--color-surface-subtle)',
  border:   'var(--color-border)',
  border2:  'var(--color-border-strong)',
  text:     'var(--color-text-primary)',
  muted:    'var(--color-text-secondary)',
  dim:      'var(--color-text-disabled)',
  font:     "'DM Sans',sans-serif" as const,
};

/* ─── Global CSS injected via <style>{GLOBAL}</style> ────────────────── */
export const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
  input::placeholder,textarea::placeholder{color:var(--color-text-disabled)!important;}
  select option,option{background:var(--color-bg-surface);color:var(--color-text-primary);}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ─── Reusable inline style presets ──────────────────────────────────── */
export const inp: CSSProperties = {
  width: '100%', padding: '10px 14px',
  background: S.surface2, border: `1px solid ${S.border2}`,
  borderRadius: 10, color: S.text, fontSize: 14, fontFamily: S.font,
};

export const lbl: CSSProperties = {
  fontSize: 11, color: S.dim, textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 6, fontWeight: 600,
  display: 'block', fontFamily: S.font,
};
