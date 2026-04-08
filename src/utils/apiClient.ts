import { toast } from 'sonner';

let lastWakeToast = 0;
const TOAST_COOLDOWN_MS = 12000;

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    const now = Date.now();
    if (now - lastWakeToast > TOAST_COOLDOWN_MS) {
      lastWakeToast = now;
      toast.error('Server is waking up — please wait a moment and try again.');
    }
    throw error;
  }
}
