import React, { useEffect, useState } from 'react';

interface InsightBannerProps {
  message: string;
  /** Duration in ms before auto-dismiss. Set to 0 to disable auto-dismiss. */
  duration?: number;
  onDismiss?: () => void;
  accentColor?: string;
}

/**
 * AI insight overlay/banner — the between-section insight card from onboarding,
 * reusable for any page that wants to show contextual AI feedback.
 *
 * When used as a full overlay (default), it covers the viewport with a blur backdrop.
 * Pass `inline` to render it as an inline card instead.
 */
const InsightBanner: React.FC<InsightBannerProps & { inline?: boolean }> = ({
  message,
  duration = 4000,
  onDismiss,
  accentColor = '#6C63FF',
  inline = false,
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!duration) return;
    const t = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  if (!visible) return null;

  if (inline) {
    return (
      <div style={{
        padding: '16px 20px',
        background: hexToRgba(accentColor, 0.1),
        border: `1px solid ${hexToRgba(accentColor, 0.3)}`,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        animation: 'insight-fade-in 0.4s ease',
      }}>
        <style>{`@keyframes insight-fade-in { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>
        <span style={{ fontSize: 20, flexShrink: 0 }}>✨</span>
        <p style={{ fontSize: 14, color: accentColor, lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
          {message}
        </p>
        {onDismiss && (
          <button
            onClick={() => { setVisible(false); onDismiss(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 16, flexShrink: 0, padding: 0 }}
            aria-label="Dismiss insight"
          >×</button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.85)',
      zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(8px)',
      animation: 'insight-fade-in 0.3s ease',
    }}>
      <style>{`@keyframes insight-fade-in { from { opacity:0; } to { opacity:1; } }`}</style>
      <div style={{ textAlign: 'center', maxWidth: 500, padding: '0 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>✨</div>
        <p style={{
          fontSize: 22, fontWeight: 600, color: '#fff',
          lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif",
        }}>
          {message}
        </p>
        {onDismiss && (
          <button
            onClick={() => { setVisible(false); onDismiss(); }}
            style={{
              marginTop: 24, padding: '10px 24px',
              background: accentColor, border: 'none', borderRadius: 8,
              color: '#000', fontWeight: 700, cursor: 'pointer',
              fontSize: 14, fontFamily: "'DM Sans', sans-serif",
            }}
          >Got it</button>
        )}
      </div>
    </div>
  );
};

export default InsightBanner;
