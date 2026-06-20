import { Link } from 'react-router-dom';
import { LEGAL_DOCS } from '../../pages/LegalPage';

// Persistent footer links to every user-facing legal document. Single source from
// LEGAL_DOCS so this list can never drift from the routed pages.
export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground ${className}`}>
      {LEGAL_DOCS.map((d) => (
        <Link key={d.slug} to={d.path} className="hover:text-foreground underline">
          {d.title}
        </Link>
      ))}
    </div>
  );
}
