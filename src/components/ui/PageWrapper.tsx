import React, { useEffect, useRef } from 'react';

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps every page with:
 * - Page-entry animation (fade in + translateY 16px → 0, 300ms spring)
 * - Correct background token via CSS variable
 * - Consistent max-width / padding
 */
const PageWrapper: React.FC<PageWrapperProps> = ({ children, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    // Trigger reflow
    void el.offsetHeight;
    el.style.transition = 'opacity 300ms cubic-bezier(0.34,1.56,0.64,1), transform 300ms cubic-bezier(0.34,1.56,0.64,1)';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        minHeight: '100%',
        background: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {children}
    </div>
  );
};

export default PageWrapper;
