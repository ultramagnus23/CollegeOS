import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

type CollegeRailItem = {
  id: string | number;
  name: string;
  country?: string | null;
  best_rank?: number | null;
  popularity_score?: number;
};

type RailState = {
  title: string;
  endpoint: () => Promise<any>;
  data: CollegeRailItem[];
};

const RAILS: Array<{ key: string; title: string; endpoint: () => Promise<any> }> = [
  { key: 'global', title: 'Top Global Universities', endpoint: () => api.discovery.topGlobal(12) },
  { key: 'cs', title: 'Top CS Schools', endpoint: () => api.discovery.topCS(12) },
  { key: 'engineering', title: 'Top Engineering Schools', endpoint: () => api.discovery.topEngineering(12) },
  { key: 'business', title: 'Top Business Schools', endpoint: () => api.discovery.topBusiness(12) },
  { key: 'trending', title: 'Trending Colleges', endpoint: () => api.discovery.trending(12) },
];

const Rankings: React.FC = () => {
  const [rails, setRails] = useState<RailState[]>(() => RAILS.map((r) => ({ ...r, data: [] })));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const responses = await Promise.all(RAILS.map((r) => r.endpoint()));
        if (!mounted) return;
        setRails((prev) => prev.map((rail, i) => ({ ...rail, data: responses[i]?.data || [] })));
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || 'Failed to load rankings');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-bold mb-6">Rankings</h1>
          <div className="text-sm text-muted-foreground">Loading ranking rails…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-bold mb-6">Rankings</h1>
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Rankings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discover top universities by global prestige, subject excellence, and real student demand.
          </p>
        </div>

        {rails.map((rail) => (
          <section key={rail.title} className="space-y-3">
            <h2 className="text-xl font-semibold">{rail.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {rail.data.map((item, idx) => (
                <a
                  key={`${rail.key}-${item.id}-${idx}`}
                  href={`/colleges/${item.id}`}
                  className="rounded-lg border bg-card hover:border-primary/40 transition-colors p-4"
                >
                  <div className="text-xs text-muted-foreground mb-1">#{idx + 1}</div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {[item.country, item.best_rank ? `Rank #${item.best_rank}` : null].filter(Boolean).join(' · ')}
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default Rankings;

