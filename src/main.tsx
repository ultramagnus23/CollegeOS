import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.tsx";
import "./index.css";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// Fire a warmup ping immediately — before auth, before React renders — so the
// Render free-tier backend wakes up while the user is still reading the landing
// page. /ping is a no-DB endpoint so it responds the instant the process is up.
if (import.meta.env.VITE_DISABLE_HEALTH_POLLING !== '1') {
  const rawBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
  const base = rawBase.endsWith('/api') ? rawBase.slice(0, -4) : rawBase;
  const pingUrl = `${base}/ping`;
  let attempts = 0;
  const maxAttempts = 20; // up to ~60s of retries
  const ping = () => {
    if (attempts++ >= maxAttempts) return;
    fetch(pingUrl, { method: 'GET', cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('not ok'); })
      .catch(() => setTimeout(ping, 3000));
  };
  ping();
}

createRoot(document.getElementById("root")!).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <App />
  </GoogleOAuthProvider>
);
