// src/pages/Discover.tsx — Dark Editorial Style
import React from 'react';

const S = {
  bg: 'var(--color-bg-primary)',
  surface: 'var(--color-bg-surface)',
  surface2: 'var(--color-surface-subtle)',
  border: 'var(--color-border)',
  border2: 'var(--color-border-strong)',
  muted: 'var(--color-text-secondary)',
  dim: 'var(--color-text-disabled)',
  font: "'DM Sans',sans-serif",
};

const ACCENT = '#6C63FF';

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
`;

const Discover: React.FC = () => (
  <div style={{ minHeight: '100vh', background: S.bg, fontFamily: S.font, padding: '40px 24px' }}>
    <style>{GLOBAL}</style>
    <div style={{ maxWidth: 560, margin: '80px auto', animation: 'fadeUp 0.4s ease both' }}>
      <div style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderTop: `3px solid ${ACCENT}`,
        borderRadius: 20,
        padding: '48px 40px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>🧭</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 12 }}>
          Discover
        </h1>
        <p style={{ fontSize: 16, color: S.muted, fontFamily: S.font, marginBottom: 28, lineHeight: 1.6 }}>
          Explore colleges, programs, and insights tailored to you.
        </p>
        <div style={{
          padding: '20px 24px',
          background: S.surface2,
          border: `1px solid ${S.border2}`,
          borderRadius: 12,
        }}>
          <p style={{ fontSize: 14, color: S.dim, fontFamily: S.font, lineHeight: 1.6 }}>
            🚀 This feature is coming soon. We're building something great!
          </p>
        </div>
      </div>
    </div>
  </div>
);

export default Discover;
