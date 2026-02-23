import React from 'react';

interface ChipProps {
  label: string;
  selected: boolean;
  accentColor?: string;
  onClick: () => void;
  className?: string;
}

/**
 * Selectable chip/pill component with bounce animation on select.
 * Matches the onboarding design system.
 */
const Chip: React.FC<ChipProps> = ({
  label,
  selected,
  accentColor = '#6C63FF',
  onClick,
  className = '',
}) => {
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  return (
    <>
      <style>{`
        @keyframes chip-bounce {
          0% { transform: scale(1); }
          40% { transform: scale(1.12); }
          70% { transform: scale(0.96); }
          100% { transform: scale(1.05); }
        }
      `}</style>
      <button
        onClick={onClick}
        className={className}
        style={{
          padding: '8px 16px',
          borderRadius: 100,
          border: `1px solid ${selected ? accentColor : 'var(--color-border, rgba(255,255,255,0.15))'}`,
          background: selected ? hexToRgba(accentColor, 0.2) : 'transparent',
          color: selected ? accentColor : 'var(--color-text-secondary, rgba(255,255,255,0.7))',
          fontSize: 13,
          fontWeight: selected ? 600 : 400,
          cursor: 'pointer',
          transition: 'all 0.12s ease',
          transform: selected ? 'scale(1.05)' : 'scale(1)',
          animation: selected ? 'chip-bounce 0.3s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
          boxShadow: selected ? `0 0 12px ${hexToRgba(accentColor, 0.3)}` : 'none',
          fontFamily: "'DM Sans', sans-serif",
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </button>
    </>
  );
};

export default Chip;
