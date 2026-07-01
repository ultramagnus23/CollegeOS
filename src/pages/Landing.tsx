import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap, Target, Calendar, Globe2, DollarSign, TrendingUp,
  FlaskConical, UserCircle, School, ShieldCheck, ChevronDown,
  Rocket, BadgeCheck, Compass, Wallet, Briefcase, Users2,
} from 'lucide-react';
import { LegalFooter } from '../components/legal/LegalFooter';
import { api } from '../services/api';
import { formatCountryName } from '../lib/country';
import { isMastersTrackEnabled } from '../config/featureFlags';

interface ComprehensiveStats {
  total: number;
  countries: { country: string; count: number }[];
}

const FALLBACK_TOTAL = 6000;

const mastersEnabled = isMastersTrackEnabled();

/* ── Shared visual tokens (reuses existing app CSS-var/Tailwind theme) ───── */
const sectionPad = 'px-6 py-20 md:py-28';
const container = 'max-w-6xl mx-auto';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-4">
      {children}
    </p>
  );
}

/* ── 1. HERO ──────────────────────────────────────────────────────────── */
function Hero({ totalLabel, countryCount }: { totalLabel: string; countryCount: number }) {
  return (
    <header className={`relative overflow-hidden border-b border-border ${sectionPad}`}>
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(60% 50% at 30% 0%, hsl(var(--primary) / 0.18), transparent 70%), radial-gradient(50% 40% at 90% 20%, hsl(var(--primary) / 0.12), transparent 70%)',
        }}
      />
      <div className={`${container} relative`}>
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-6">
          CollegeOS
        </p>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.05] mb-6 max-w-4xl">
          The operating system for higher education decisions.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
          One platform for undergraduate, masters, and PhD applicants worldwide — university
          discovery, admissions strategy, financial planning, and career outcomes, backed by
          real data with no fabricated numbers.
        </p>
        <div className="flex flex-wrap gap-4 mb-10">
          <Link
            to="/colleges"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition shadow-lg shadow-primary/20"
          >
            Explore Universities →
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl border border-border text-foreground font-semibold hover:bg-muted transition"
          >
            Get Started Free
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl text-muted-foreground font-semibold hover:text-foreground transition"
          >
            Log in
          </Link>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm text-muted-foreground">
          <span><span className="text-foreground font-semibold">{totalLabel}</span> universities tracked</span>
          <span><span className="text-foreground font-semibold">{countryCount || 'Global'}</span>{typeof countryCount === 'number' && countryCount > 0 ? ' countries' : ' coverage'}</span>
          <span>Undergrad · Masters{mastersEnabled ? '' : ' (in progress)'} · PhD-track research fit</span>
        </div>
      </div>
    </header>
  );
}

/* ── 2. PRODUCT OVERVIEW ──────────────────────────────────────────────── */
const productPillars = [
  { title: 'University Discovery', description: 'Search and filter by cost, outcomes, admissions bar, and fit — not marketing copy.', icon: Compass },
  { title: 'Admissions Intelligence', description: 'Reach/Match/Safety classification from real acceptance data and your actual profile.', icon: Target },
  { title: 'Financial Intelligence', description: 'Total cost of attendance, aid, and net price — verified figures, never estimates shown as facts.', icon: Wallet },
  { title: 'Application Tracking', description: 'Deadlines, essays, recommenders, and documents in one place across every school on your list.', icon: Calendar },
];

function ProductOverview() {
  return (
    <section className={sectionPad}>
      <div className={container}>
        <SectionLabel>What CollegeOS does</SectionLabel>
        <h2 className="text-3xl md:text-4xl font-bold mb-4 max-w-2xl">
          Everything a higher-education decision requires, in one place.
        </h2>
        <p className="text-muted-foreground max-w-2xl mb-12">
          Most tools cover one slice — a search engine, a spreadsheet, a forum thread. CollegeOS
          connects discovery, strategy, money, and outcomes so decisions are made on evidence.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {productPillars.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="bg-card border border-border rounded-2xl p-6 hover:border-primary/40 transition">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 3 & 4. UNDERGRAD + MASTERS JOURNEYS ──────────────────────────────── */
function JourneySplit() {
  return (
    <section className={`${sectionPad} bg-card/40 border-y border-border`}>
      <div className={container}>
        <SectionLabel>Built for both paths</SectionLabel>
        <h2 className="text-3xl md:text-4xl font-bold mb-12 max-w-2xl">
          Undergraduate and graduate applicants need different tools. CollegeOS gives each its own.
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Undergrad */}
          <div className="rounded-2xl border border-border p-8 bg-background">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-3">Undergraduate</h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground mb-6">
              <li>• Reach/Match/Safety chancing from your GPA, tests, and activities</li>
              <li>• Full cost of attendance, aid, and scholarship breakdowns</li>
              <li>• Deadline, essay, and recommender tracking across your whole list</li>
              <li>• Test-optional, holistic-review, and interview-requirement flags per school</li>
            </ul>
            <Link to="/colleges" className="text-sm font-semibold text-primary hover:underline">
              Explore undergraduate universities →
            </Link>
          </div>
          {/* Masters */}
          <div className="rounded-2xl border border-border p-8 bg-background">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
              <FlaskConical className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-3">Masters &amp; PhD-track</h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground mb-6">
              <li>• Program-level admissions signals: GRE/GPA bands, research vs. work-experience pathways</li>
              <li>• Funding visibility — TA/RA availability, stipends, and tuition waivers where reported</li>
              <li>• Faculty and research-fit context for research-track applicants</li>
              <li>• Immigration-relevant flags (OPT/STEM-OPT eligibility) where applicable</li>
            </ul>
            {mastersEnabled ? (
              <Link to="/masters" className="text-sm font-semibold text-primary hover:underline">
                Explore graduate programs →
              </Link>
            ) : (
              <span className="text-sm font-semibold text-muted-foreground">Rolling out now</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 5, 6, 7, 8. INTELLIGENCE PILLARS ─────────────────────────────────── */
const intelligencePillars = [
  {
    title: 'Admissions Intelligence',
    description: 'Chancing built from real acceptance rates, test-score bands, and your profile — labeled Insufficient Data rather than guessing when a school lacks verified admissions data.',
    icon: Target,
  },
  {
    title: 'Financial Intelligence',
    description: 'Tuition, housing, aid, and net price sourced from official data. Unverifiable figures are shown as missing, never filled in with a plausible-looking placeholder.',
    icon: DollarSign,
  },
  {
    title: 'Career Outcomes',
    description: 'Graduation rates, employment rates, and reported salary data where institutions publish it — connecting a school choice to what happens after.',
    icon: TrendingUp,
  },
  {
    title: 'Research & Faculty Fit',
    description: 'For research-track masters and PhD-bound applicants: department, lab, and faculty context to evaluate fit beyond program rankings.',
    icon: FlaskConical,
  },
];

function IntelligencePillars() {
  return (
    <section className={sectionPad}>
      <div className={container}>
        <SectionLabel>The intelligence layer</SectionLabel>
        <h2 className="text-3xl md:text-4xl font-bold mb-12 max-w-2xl">
          Four kinds of signal, one standard: verified or clearly marked as unverified.
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {intelligencePillars.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="flex gap-5 rounded-2xl border border-border p-6 bg-card">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-2">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 9. STUDENT PROFILES ──────────────────────────────────────────────── */
function StudentProfiles() {
  const profiles = [
    { icon: UserCircle, title: 'First-generation applicants', description: 'Clear explanations at every step — no assumed familiarity with the process.' },
    { icon: Globe2, title: 'International applicants', description: 'Visa, currency, and country-specific admissions context built in, not bolted on.' },
    { icon: Briefcase, title: 'Career-changers & working professionals', description: 'Masters pathways that weigh work experience alongside test scores and GPA.' },
    { icon: Users2, title: 'Research-track students', description: 'Faculty and lab fit surfaced early, before an application is written.' },
  ];
  return (
    <section className={`${sectionPad} bg-card/40 border-y border-border`}>
      <div className={container}>
        <SectionLabel>Who it's for</SectionLabel>
        <h2 className="text-3xl md:text-4xl font-bold mb-12 max-w-2xl">
          Different starting points. The same standard of honest information.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {profiles.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="rounded-2xl border border-border p-6 bg-background">
                <Icon className="w-6 h-6 text-primary mb-4" />
                <h3 className="text-sm font-semibold mb-2">{p.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 10 & 11. UNIVERSITY EXPLORATION + GLOBAL COVERAGE ────────────────── */
const regions = [
  'United States', 'Canada', 'United Kingdom', 'Europe (Germany, Netherlands, Ireland, France & more)',
  'Australia', 'Singapore', 'India', 'Asia-Pacific (Hong Kong, South Korea, Japan & more)',
];

function GlobalCoverage({ totalLabel, countries }: { totalLabel: string; countries: { country: string; count: number }[] }) {
  return (
    <section className={sectionPad}>
      <div className={container}>
        <SectionLabel>Global by default</SectionLabel>
        <h2 className="text-3xl md:text-4xl font-bold mb-4 max-w-2xl">
          Not a country-specific tool. A global one.
        </h2>
        <p className="text-muted-foreground max-w-2xl mb-10">
          {totalLabel} universities tracked across every major study-abroad destination — the same
          depth of admissions, financial, and outcomes data regardless of where a school is.
        </p>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {regions.map((r) => (
            <div key={r} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3">
              <Globe2 className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground">{r}</span>
            </div>
          ))}
        </div>
        {countries.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Live coverage today: {countries.slice(0, 8).map((c) => formatCountryName(c.country)).filter(Boolean).join(', ')}
            {countries.length > 8 ? `, and ${countries.length - 8} more` : ''}.
          </p>
        )}
      </div>
    </section>
  );
}

/* ── 12. WHY COLLEGEOS EXISTS ──────────────────────────────────────────── */
function WhyItExists() {
  return (
    <section className={`${sectionPad} bg-card/40 border-y border-border`}>
      <div className={`${container} max-w-3xl`}>
        <SectionLabel>Why we built this</SectionLabel>
        <h2 className="text-3xl md:text-4xl font-bold mb-6">
          The application process runs on guesswork. We think it shouldn't.
        </h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Chancing calculators that invent a probability when there's no real acceptance-rate
            data. Tuition figures that are actually placeholders. Rankings copied without checking
            whether they're current. Every one of these looks authoritative and isn't.
          </p>
          <p>
            CollegeOS is built around a simple rule: if a number can't be traced to a real,
            checkable source, it doesn't get shown as one. Where we don't have verified data, we
            say so — an admissions estimate that reads "Insufficient Data" is more useful than a
            confident-looking number that's actually a guess.
          </p>
          <p>
            That standard shapes everything downstream: which data gets scraped, what a scraper is
            allowed to write to the database, and what a chancing score is allowed to claim.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── 13. TRUST / PLACEHOLDER FOR TESTIMONIALS ─────────────────────────── */
function TrustSection() {
  // Deliberately NOT fabricated testimonials with invented names/quotes/photos —
  // that would be exactly the kind of manufactured-looking trust signal this
  // product's own data policy exists to avoid. This section states the real,
  // verifiable commitments instead, and can be replaced with real testimonials
  // once they exist.
  const commitments = [
    { icon: ShieldCheck, title: 'No fabricated numbers', description: 'Every acceptance rate, tuition figure, and chancing estimate traces to a real source or is shown as missing.' },
    { icon: BadgeCheck, title: 'Provenance on every data point', description: 'Financial and admissions data carries a verification status — verified, scraped, or unknown — not a single unlabeled number.' },
    { icon: Rocket, title: 'Built in the open', description: 'Source available on GitHub. The data pipeline and its limitations are not hidden behind a black box.' },
  ];
  return (
    <section className={sectionPad}>
      <div className={container}>
        <SectionLabel>Why you can trust the numbers</SectionLabel>
        <h2 className="text-3xl md:text-4xl font-bold mb-12 max-w-2xl">
          We'd rather show you nothing than show you something fabricated.
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {commitments.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="rounded-2xl border border-border p-6 bg-card">
                <Icon className="w-6 h-6 text-primary mb-4" />
                <h3 className="text-sm font-semibold mb-2">{c.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 14. FAQ ───────────────────────────────────────────────────────────── */
const faqs = [
  {
    q: 'Does CollegeOS support masters and PhD applicants, or just undergrad?',
    a: 'Both. The undergraduate product covers university discovery, chancing, and application tracking. The graduate track adds program-level admissions pathways, funding visibility, and research/faculty fit for masters and PhD-track applicants.',
  },
  {
    q: 'How does chancing work if you refuse to guess?',
    a: 'Chancing is computed from your real profile against a school\'s real, verified acceptance-rate and test-score data. When a school lacks verified data for a given factor, that factor is excluded rather than defaulted to an assumed value — and if there isn\'t enough real signal at all, you get an explicit "Insufficient Data" result instead of a fabricated percentage.',
  },
  {
    q: 'Is this only for a specific country\'s applicants?',
    a: 'No. CollegeOS tracks universities across the US, Canada, UK, Europe, Australia, Singapore, India, and other Asia-Pacific destinations, with the same admissions/financial/outcomes framework applied globally.',
  },
  {
    q: 'What happens when data can\'t be verified?',
    a: 'It\'s shown as missing, not filled in with an estimate. This is a deliberate product decision, not a limitation we\'re hiding — a missing tuition figure is more honest than a wrong one that looks correct.',
  },
  {
    q: 'Is CollegeOS free to use?',
    a: 'Browsing universities requires no account. Creating a free profile unlocks chancing, application tracking, and (where enabled) the graduate program track.',
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className={`${sectionPad} bg-card/40 border-y border-border`}>
      <div className={`${container} max-w-3xl`}>
        <SectionLabel>Questions</SectionLabel>
        <h2 className="text-3xl md:text-4xl font-bold mb-10">Frequently asked</h2>
        <div className="space-y-3">
          {faqs.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="rounded-xl border border-border bg-background overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-semibold">{item.q}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 15. FINAL CTA ─────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section className={sectionPad}>
      <div className={`${container} max-w-3xl text-center`}>
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <School className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Start with real information, not a guess.
        </h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          Browse universities with no account, or create a free profile to unlock chancing,
          financial planning, and application tracking — undergraduate or graduate.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            to="/auth"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition shadow-lg shadow-primary/20"
          >
            Get Started Free
          </Link>
          <Link
            to="/colleges"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl border border-border text-foreground font-semibold hover:bg-muted transition"
          >
            Explore Universities First
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */

export default function Landing() {
  const [stats, setStats] = useState<ComprehensiveStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.colleges.getStats();
        const data = res?.data ?? res;
        if (!cancelled && data?.total) setStats(data);
      } catch {
        /* fall back to the static copy below */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalLabel = stats?.total ? `${Math.floor(stats.total / 100) * 100}+` : `${FALLBACK_TOTAL}+`;
  const countries = stats?.countries ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Hero totalLabel={totalLabel} countryCount={countries.length} />
      <ProductOverview />
      <JourneySplit />
      <IntelligencePillars />
      <StudentProfiles />
      <GlobalCoverage totalLabel={totalLabel} countries={countries} />
      <WhyItExists />
      <TrustSection />
      <FAQ />
      <FinalCTA />

      <footer className="border-t border-border py-10">
        <div className="max-w-6xl mx-auto px-6 space-y-4">
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <Link to="/colleges" className="hover:text-foreground">Colleges</Link>
            {mastersEnabled && <Link to="/masters" className="hover:text-foreground">Graduate Programs</Link>}
            <Link to="/auth" className="hover:text-foreground">Get Started</Link>
            <a
              href="https://github.com/ultramagnus23/CollegeOS"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              GitHub
            </a>
          </div>
          <LegalFooter />
        </div>
      </footer>
    </div>
  );
}
