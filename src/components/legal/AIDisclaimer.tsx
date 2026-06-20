import { Link } from 'react-router-dom';

// Persistent, visible AI disclaimer surfaced anywhere the app shows an AI-generated
// estimate (chancing %, recommendations) or a chatbot response. Wording is derived from
// /legal/ai-disclaimer.md (statistical estimates, not guarantees, not professional advice).
export function AIDisclaimer({
  variant = 'estimate',
  className = '',
}: { variant?: 'estimate' | 'recommendations' | 'chatbot'; className?: string }) {
  const text = variant === 'chatbot'
    ? 'AI responses are informational, may be inaccurate or incomplete, and are not professional educational, financial, or immigration advice.'
    : variant === 'recommendations'
      ? 'Recommendations are statistical estimates from historical patterns — not a guarantee of admission, fit, or outcome, and not a substitute for a licensed counselor.'
      : 'This is a statistical estimate based on historical patterns — not a guarantee of admission, and not a substitute for a licensed educational counselor.';
  return (
    <p className={`text-xs text-muted-foreground flex flex-wrap items-center gap-1 ${className}`}>
      <span aria-hidden="true">⚠️</span>
      <span>{text}</span>
      <Link to="/ai-disclaimer" className="underline hover:text-foreground">Learn more</Link>
    </p>
  );
}
