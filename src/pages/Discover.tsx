import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

const Discover: React.FC = () => {
  const [colleges, setColleges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');

  useEffect(() => {
    fetchColleges();
  }, [country]);

  const fetchColleges = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (country) params.country = country;
      if (search) params.search = search;
      const res = await api.getColleges(params);
      setColleges(res.data || []);
    } catch {
      setColleges([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchColleges();
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Discover Colleges</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Explore universities around the world and find the right fit for you.
      </p>

      {/* Search + filter bar */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by name, major, location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
        />
        <select
          value={country}
          onChange={e => setCountry(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
        >
          <option value="">All Countries</option>
          <option value="United States">United States</option>
          <option value="United Kingdom">United Kingdom</option>
          <option value="India">India</option>
          <option value="Europe">Europe</option>
        </select>
        <button
          type="submit"
          style={{ padding: '10px 20px', borderRadius: 8, background: '#6C63FF', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          Search
        </button>
      </form>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Loading colleges…</div>
      ) : colleges.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>No colleges found.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {colleges.map((college: any) => (
            <Link
              key={college?.id}
              to={`/colleges/${college?.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
                padding: '20px 22px', cursor: 'pointer', transition: 'box-shadow 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                  {college?.name ?? 'Unknown College'}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
                  {college?.location ?? college?.country ?? 'Location unknown'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {college?.acceptanceRate != null && (
                    <span style={{ fontSize: 12, background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>
                      {Math.round((college.acceptanceRate ?? 0) * 100)}% acceptance
                    </span>
                  )}
                  {(college?.majorCategories ?? []).slice(0, 2).map((m: string) => (
                    <span key={m} style={{ fontSize: 12, background: '#ede9fe', color: '#6C63FF', padding: '3px 10px', borderRadius: 20 }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Discover;
