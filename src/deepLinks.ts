const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://kelimet500.boraeskicioglu.com/').replace(/\/?$/, '/');
const CHALLENGE_QUERY = 'arkadas';

export const APP_SCHEME = 'kelimet500';
export const APP_LINK_HOST = new URL(PUBLIC_APP_URL).host;

export function challengeUrlForToken(token: string) {
  const base = new URL(PUBLIC_APP_URL);
  base.pathname = `/challenge/${encodeURIComponent(token)}`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

export function appSchemeUrlForToken(token: string) {
  return `${APP_SCHEME}://challenge/${encodeURIComponent(token)}`;
}

export function challengeTokenFromUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl, PUBLIC_APP_URL);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol === `${APP_SCHEME}:` && url.hostname === 'challenge' && parts[0]) {
      return decodeURIComponent(parts[0]);
    }
    const challengeIndex = parts.indexOf('challenge');
    if (challengeIndex >= 0 && parts[challengeIndex + 1]) {
      return decodeURIComponent(parts[challengeIndex + 1]);
    }
    return url.searchParams.get(CHALLENGE_QUERY);
  } catch {
    return null;
  }
}

export function challengeTokenFromWindow() {
  return challengeTokenFromUrl(window.location.href);
}

export function clearChallengeBrowserUrl() {
  try {
    const current = new URL(window.location.href);
    if (!challengeTokenFromUrl(current.toString())) return;
    window.history.replaceState({}, '', '/');
  } catch {
    // Capacitor's internal URL may not behave like a normal web URL on all platforms.
  }
}
