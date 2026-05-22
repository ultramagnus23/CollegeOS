import { toast } from 'sonner';
import { fetchWithResilience } from '../services/networkManager';

let lastWakeToast = 0;
const TOAST_COOLDOWN_MS = 12000;

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetchWithResilience(input, init, {
      retries: 2,
      baseDelayMs: 350,
      timeoutMs: 12000,
    });
  } catch (error) {
    const now = Date.now();
    if (now - lastWakeToast > TOAST_COOLDOWN_MS) {
      lastWakeToast = now;
      toast.error('Server is waking up — please wait a moment and try again.');
    }
    throw error;
  }
}
