import { Link } from 'react-router-dom';
import { GraduationCap, Target, Calendar } from 'lucide-react';

const features = [
  {
    title: 'College Explorer',
    description: 'Search and filter 6,000+ universities. See acceptance rates, cost of attendance in INR, median scores, and what Indian applicants actually need.',
    icon: GraduationCap,
  },
  {
    title: 'Chancing Calculator',
    description: 'Enter your GPA, test scores, and activities. Our model tells you if a school is a Reach, Match, or Safety — without fake percentages.',
    icon: Target,
  },
  {
    title: 'Application Tracker',
    description: 'Deadlines, essays, recommenders, documents — all in one place. Never miss a date.',
    icon: Calendar,
  },
];

const steps = [
  { title: 'Browse colleges freely — no account needed' },
  { title: 'Create a free profile to unlock chancing and tracking' },
  { title: 'Track every application from shortlist to decision' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <header className="mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            CollegeOS
          </p>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            Your entire college application, in one OS.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-10">
            Built for Indian students applying to US, UK &amp; Germany universities. Search 6,000+ colleges, track deadlines, compare financial aid, and see your real admission chances.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/colleges"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
            >
              Explore Colleges →
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-border text-foreground font-semibold hover:bg-muted transition"
            >
              Get Started Free
            </Link>
          </div>
        </header>

        <section className="grid md:grid-cols-3 gap-6 mb-20">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <Icon className="w-6 h-6 text-primary mb-4" />
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </section>

        <section className="bg-card border border-border rounded-2xl p-8 mb-20">
          <h2 className="text-2xl font-semibold mb-6">How it works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step, index) => (
              <div key={step.title} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  {index + 1}
                </div>
                <p className="text-sm text-muted-foreground">{step.title}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t border-border py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap gap-6 text-sm text-muted-foreground">
          <Link to="/colleges" className="hover:text-foreground">Colleges</Link>
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
      </footer>
    </div>
  );
}
