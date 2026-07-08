// Lightweight metadata for the 8 user-facing legal documents — slug/path/title only,
// no document text. Split out from LegalPage.tsx so components that just need to link
// to legal pages (LegalFooter, rendered on nearly every authenticated page) don't pull
// the full raw markdown of all 8 documents (~120KB) into their chunk. LegalPage.tsx
// itself still loads the full text (via ?raw imports) for actually rendering a document.
export interface LegalDocMeta { slug: string; path: string; title: string; }

export const LEGAL_DOCS_META: LegalDocMeta[] = [
  { slug: 'terms', path: '/terms', title: 'Terms of Service' },
  { slug: 'privacy', path: '/privacy', title: 'Privacy Policy' },
  { slug: 'cookies', path: '/cookies', title: 'Cookie Policy' },
  { slug: 'data-retention', path: '/data-retention', title: 'Data Retention Policy' },
  { slug: 'account-deletion', path: '/account-deletion', title: 'Account Deletion Policy' },
  { slug: 'minor-policy', path: '/minor-policy', title: 'Minor User Policy' },
  { slug: 'community-guidelines', path: '/community-guidelines', title: 'Community Guidelines' },
  { slug: 'ai-disclaimer', path: '/ai-disclaimer', title: 'AI Disclaimer' },
];
