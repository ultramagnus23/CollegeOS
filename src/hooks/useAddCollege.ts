import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export type AddCollegeResult = 'added' | 'duplicate' | 'error' | 'unauth';

interface AddOptions {
  /** Navigate here after a successful add (e.g. '/applications'). Omit to stay put. */
  navigateTo?: string;
  /** Suppress toasts (caller renders its own inline feedback). */
  silent?: boolean;
}

/**
 * Single source of truth for adding a college to the user's application list.
 *
 * Both Browse (Colleges) and the post-onboarding Suggestions page use this, so
 * the createApplication contract (and the Phase-1 identity-map fix behind it)
 * lives in exactly one place. Sends the same payload the backend expects:
 * { college_id, canonical_institution_id, application_type }.
 */
export function useAddCollege() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [addingId, setAddingId] = useState<string | number | null>(null);

  const addCollege = useCallback(
    async (collegeId: string | number, opts: AddOptions = {}): Promise<AddCollegeResult> => {
      if (!user) {
        toast.info('Create a free account to save colleges.');
        navigate('/auth');
        return 'unauth';
      }
      setAddingId(collegeId);
      try {
        const payload = {
          college_id: collegeId,
          canonical_institution_id: collegeId,
          application_type: 'regular',
        };
        try {
          await api.applications.create(payload);
        } catch (firstErr: any) {
          // Retry once for transient network failures only.
          if (String(firstErr?.message ?? '').toLowerCase().includes('network')) {
            await api.applications.create(payload);
          } else {
            throw firstErr;
          }
        }
        if (!opts.silent) toast.success('Added to your list!');
        if (opts.navigateTo) navigate(opts.navigateTo);
        return 'added';
      } catch (err: any) {
        const msg = String(err?.message ?? '').toLowerCase();
        if (msg.includes('already')) {
          if (!opts.silent) toast.info('Already in your list');
          return 'duplicate';
        }
        if (!opts.silent) toast.error('Failed to add college');
        return 'error';
      } finally {
        setAddingId(null);
      }
    },
    [user, navigate],
  );

  return { addCollege, addingId };
}
