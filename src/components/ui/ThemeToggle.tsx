import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 100,
        border: '1px solid rgba(255,255,255,0.15)',
        background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        minWidth: 72,
        justifyContent: 'space-between',
        position: 'relative',
      }}
    >
      {/* Track */}
      <span style={{ fontSize: 14 }}>☀️</span>
      {/* Thumb */}
      <span style={{
        position: 'absolute',
        top: 4,
        left: isDark ? 'calc(100% - 28px)' : 4,
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: isDark ? '#6C63FF' : '#F59E0B',
        transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: isDark ? '0 0 10px rgba(108,99,255,0.5)' : '0 0 10px rgba(245,158,11,0.5)',
      }} />
      <span style={{ fontSize: 14 }}>🌙</span>
    </button>
  );
};

export default ThemeToggle;
