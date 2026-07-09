import { Link, useParams } from 'react-router-dom';
import { MarkdownView } from '../components/legal/MarkdownView';
import { LEGAL_DOCS_META } from './legalDocsMeta';

import termsRaw from '../../legal/terms-of-service.md?raw';
import privacyRaw from '../../legal/privacy-policy.md?raw';
import cookiesRaw from '../../legal/cookie-policy.md?raw';
import dataRetentionRaw from '../../legal/data-retention-policy.md?raw';
import accountDeletionRaw from '../../legal/account-deletion-policy.md?raw';
import minorPolicyRaw from '../../legal/minor-user-policy.md?raw';
import communityRaw from '../../legal/community-guidelines.md?raw';
import aiDisclaimerRaw from '../../legal/ai-disclaimer.md?raw';

export interface LegalDoc { slug: string; path: string; title: string; source: string; }

// Single source of truth for the user-facing legal pages. Content is rendered directly
// from /legal/*.md so the live page can never drift from the source document. The three
// internal/engineering docs (database-compliance-design, jurisdiction-review-checklist,
// launch-readiness-report) are intentionally NOT routed.
//
// Metadata (slug/path/title) lives in ./legalDocsMeta.ts, imported below and merged with
// the raw text here -- components that only need to link to these pages (LegalFooter)
// should import LEGAL_DOCS_META directly instead of this array, so they don't pull ~120KB
// of raw markdown into their chunk just to render a list of links.
const RAW_BY_SLUG: Record<string, string> = {
  terms: termsRaw,
  privacy: privacyRaw,
  cookies: cookiesRaw,
  'data-retention': dataRetentionRaw,
  'account-deletion': accountDeletionRaw,
  'minor-policy': minorPolicyRaw,
  'community-guidelines': communityRaw,
  'ai-disclaimer': aiDisclaimerRaw,
};

export const LEGAL_DOCS: LegalDoc[] = LEGAL_DOCS_META.map((d) => ({ ...d, source: RAW_BY_SLUG[d.slug] }));

const BY_SLUG = new Map(LEGAL_DOCS.map((d) => [d.slug, d]));

export default function LegalPage({ slug: slugProp }: { slug?: string }) {
  const params = useParams();
  const slug = slugProp || params.slug || 'terms';
  const doc = BY_SLUG.get(slug);

  if (!doc) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="max-w-3xl mx-auto">
          <p className="text-muted-foreground">Document not found.</p>
          <Link to="/" className="text-primary underline">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="text-sm text-primary underline">← Back to CollegeOS</Link>
        <h1 className="text-3xl font-bold mt-4 mb-1 text-foreground">{doc.title}</h1>
        <p className="text-xs text-muted-foreground mb-6">
          Provided for transparency — not legal advice. These documents are a draft pending final
          review by a licensed lawyer; sections marked “requires jurisdiction-specific legal review”
          and bracketed contact details (e.g. <code>[PRIVACY EMAIL]</code>) are intentionally not yet
          finalized. Other policies are linked at the bottom of this page.
        </p>
        <article>
          <MarkdownView source={doc.source} />
        </article>
        <div className="mt-10 pt-6 border-t border-border flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {LEGAL_DOCS.filter((d) => d.slug !== slug).map((d) => (
            <Link key={d.slug} to={d.path} className="text-primary underline">{d.title}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}
