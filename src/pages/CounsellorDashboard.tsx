import { useEffect, useState } from 'react';
import { api } from '../services/api';

interface RosterStudent {
  studentId: number;
  name: string | null;
  email: string;
  graduationYear: number | null;
  linkedAt: string;
  applicationCount: number;
  avgCompleteness: number | null;
  nextDeadline: string | null;
}

interface ApplicationProgress {
  completenessPercent: number | null;
  tasksTotal: number;
  tasksDone: number;
  essaysTotal: number;
  essaysDone: number;
  missingItems: string[];
}

interface StudentApplication {
  id: number;
  status: string;
  application_type: string | null;
  deadline: string | null;
  priority: string | null;
  round_type: string | null;
  college_name: string | null;
  college_country: string | null;
  progress: ApplicationProgress;
}

interface StudentDetail {
  student: { id: number; full_name: string | null; email: string; graduation_year: number | null; country: string | null; intended_major: string | null } | null;
  applications: StudentApplication[];
}

interface PendingLink {
  id: number;
  invited_at: string;
  full_name: string | null;
  email: string;
}

const S = {
  page: { padding: '32px', background: '#0f0f1a', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", color: '#e2e8f0' } as React.CSSProperties,
  h1: { fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 24, letterSpacing: '-0.02em' } as React.CSSProperties,
  h2: { fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
  card: { background: '#13131f', border: '1px solid #1e1e30', borderRadius: 14, padding: 24, marginBottom: 24 } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '8px 12px', color: '#475569', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', borderBottom: '1px solid #1e1e30' },
  td: { padding: '10px 12px', color: '#e2e8f0', fontSize: 13, borderBottom: '1px solid #1a1a2a' },
  row: { cursor: 'pointer' } as React.CSSProperties,
  input: { background: '#0f0f1a', border: '1px solid #2a2a3e', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, flex: 1 } as React.CSSProperties,
  button: { background: '#6C63FF', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  backButton: { background: 'transparent', border: '1px solid #2a2a3e', borderRadius: 8, padding: '6px 12px', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginBottom: 16 } as React.CSSProperties,
  progressBarOuter: { width: 120, height: 8, background: '#1e1e30', borderRadius: 4, overflow: 'hidden' } as React.CSSProperties,
  missingChip: { display: 'inline-block', background: 'rgba(245,158,11,0.12)', color: '#fbbf24', fontSize: 11, padding: '2px 8px', borderRadius: 999, marginRight: 6, marginBottom: 6 } as React.CSSProperties,
};

function ProgressBar({ percent }: { percent: number | null }) {
  if (percent == null) return <span style={{ color: '#64748b', fontSize: 12 }}>No data</span>;
  const color = percent >= 80 ? '#4ade80' : percent >= 40 ? '#fbbf24' : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={S.progressBarOuter}>
        <div style={{ width: `${percent}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600 }}>{percent}%</span>
    </div>
  );
}

function fmtDate(d: string | null): string {
  if (!d) return 'No deadline';
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

export default function CounsellorDashboard() {
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [pending, setPending] = useState<PendingLink[]>([]);
  const [selected, setSelected] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');

  const loadRoster = () => {
    setLoading(true);
    api.counsellor.roster()
      .then((res: any) => setRoster((res?.data ?? res) as RosterStudent[]))
      .catch((e: Error) => setError(e.message || 'Failed to load roster'))
      .finally(() => setLoading(false));
    api.counsellor.pending()
      .then((res: any) => setPending((res?.data ?? res) as PendingLink[]))
      .catch(() => { /* non-fatal */ });
  };

  useEffect(() => { loadRoster(); }, []);

  const openStudent = (studentId: number) => {
    setSelected(null);
    api.counsellor.studentDetail(studentId)
      .then((res: any) => setSelected((res?.data ?? res) as StudentDetail))
      .catch((e: Error) => setError(e.message || 'Failed to load student'));
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteStatus('Sending...');
    try {
      await api.counsellor.invite(inviteEmail.trim());
      setInviteStatus('Invite sent — the student needs to accept it.');
      setInviteEmail('');
    } catch (e: any) {
      setInviteStatus(e?.message || 'Failed to send invite');
    }
  };

  const respondToPending = async (linkId: number, accept: boolean) => {
    try {
      await api.counsellor.respond(linkId, accept);
      loadRoster();
    } catch { /* surfaced via reload state */ }
  };

  if (selected) {
    return (
      <div style={S.page}>
        <button style={S.backButton} onClick={() => setSelected(null)}>&larr; Back to roster</button>
        <h1 style={S.h1}>{selected.student?.full_name || selected.student?.email || 'Student'}</h1>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24 }}>
          {selected.student?.email} · {selected.student?.graduation_year ? `Class of ${selected.student.graduation_year}` : 'Grad year unknown'}
          {selected.student?.intended_major ? ` · Intended: ${selected.student.intended_major}` : ''}
        </div>

        {selected.applications.length === 0 ? (
          <div style={S.card}>No applications yet.</div>
        ) : selected.applications.map((a) => (
          <div key={a.id} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{a.college_name || 'Unknown college'}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {a.status} · {a.application_type || 'regular'} · deadline {fmtDate(a.deadline)}
                </div>
              </div>
              <ProgressBar percent={a.progress.completenessPercent} />
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
              Tasks: {a.progress.tasksDone}/{a.progress.tasksTotal} &nbsp;·&nbsp; Essays: {a.progress.essaysDone}/{a.progress.essaysTotal}
            </div>
            {a.progress.missingItems.length > 0 && (
              <div>
                {a.progress.missingItems.map((m, i) => <span key={i} style={S.missingChip}>{m}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Counsellor Dashboard</h1>

      <section style={S.card}>
        <h2 style={S.h2}>Invite a Student</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={S.input}
            placeholder="student@email.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <button style={S.button} onClick={sendInvite}>Send Invite</button>
        </div>
        {inviteStatus && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{inviteStatus}</div>}
      </section>

      {pending.length > 0 && (
        <section style={S.card}>
          <h2 style={S.h2}>Pending Requests (students who requested you)</h2>
          {pending.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1a2a' }}>
              <div>{p.full_name || p.email}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.button} onClick={() => respondToPending(p.id, true)}>Accept</button>
                <button style={{ ...S.button, background: '#2a2a3e' }} onClick={() => respondToPending(p.id, false)}>Decline</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section style={S.card}>
        <h2 style={S.h2}>My Students ({roster?.length ?? 0})</h2>
        {loading ? (
          <div style={{ color: '#64748b', fontSize: 13 }}>Loading roster...</div>
        ) : error ? (
          <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>
        ) : !roster || roster.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13 }}>No students linked yet. Invite one above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Student', 'Grad Year', 'Applications', 'Avg Completeness', 'Next Deadline'].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => (
                  <tr key={s.studentId} style={S.row} onClick={() => openStudent(s.studentId)}>
                    <td style={{ ...S.td, fontWeight: 600, color: '#f1f5f9' }}>{s.name || s.email}</td>
                    <td style={S.td}>{s.graduationYear ?? '—'}</td>
                    <td style={S.td}>{s.applicationCount}</td>
                    <td style={S.td}><ProgressBar percent={s.avgCompleteness} /></td>
                    <td style={S.td}>{fmtDate(s.nextDeadline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
