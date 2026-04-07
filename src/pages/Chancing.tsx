import { useEffect, useState } from 'react';
import { api } from '../services/api';
import ProfileCompleteness from '../components/ProfileCompleteness';

interface ChancingResult {
  college: { id: number; name: string; location?: string };
  chancing: {
    tier: string;
    confidence: string;
    explanation: string;
  };
}

export default function Chancing() {
  const [results, setResults] = useState<ChancingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.chancing.getForStudent();
        setResults(res.data?.results || []);
      } catch (err: any) {
        setError(err?.message || 'Failed to load chancing data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <ProfileCompleteness />

        <div className="bg-card border border-border rounded-xl p-6">
          <h1 className="text-2xl font-semibold mb-2">Chancing Overview</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Your chancing tiers are based on reported median stats and are not guarantees. Use them as a rough guide.
          </p>

          {loading && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="text-sm text-red-500">{error}</div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Add colleges to your list to see chancing tiers.
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {results.map((result) => (
              <div key={result.college.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{result.college.name}</h3>
                    {result.college.location && (
                      <p className="text-xs text-muted-foreground">{result.college.location}</p>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-muted">
                    {result.chancing.tier}
                  </span>
                </div>
                {result.chancing.tier === 'Unknown' ? (
                  <p className="text-sm text-muted-foreground">
                    Chancing unavailable right now — check back in a moment.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">{result.chancing.explanation}</p>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  ⚠️ International applicant pools are typically more selective. Use this as a rough guide.
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
