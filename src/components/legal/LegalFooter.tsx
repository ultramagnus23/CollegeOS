import { Link } from 'react-router-dom';
import { LEGAL_DOCS_META } from '../../pages/legalDocsMeta';

// Persistent footer links to every user-facing legal document. Single source from
// LEGAL_DOCS_META (slug/path/title only) so this list can never drift from the routed
// pages, without pulling the full document text into every page that renders a footer.
export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground ${className}`}>
      {LEGAL_DOCS_META.map((d) => (
        <Link key={d.slug} to={d.path} className="hover:text-foreground underline">
          {d.title}
        </Link>
      ))}
    </div>
  );
}
