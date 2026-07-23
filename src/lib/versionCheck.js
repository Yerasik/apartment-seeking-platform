/**
 * Force browsers to pick up a new deploy: fetch a tiny version.json
 * with cache disabled; if it changed since this tab last loaded, reload once.
 */
export async function ensureLatestBuild() {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;

    const { buildId } = await res.json();
    if (!buildId) return;

    const key = 'rt_build_id';
    const previous = sessionStorage.getItem(key);

    if (previous && previous !== buildId) {
      sessionStorage.setItem(key, buildId);
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {
          /* ignore */
        }
      }
      const url = new URL(window.location.href);
      url.searchParams.set('_rt', buildId);
      window.location.replace(url.toString());
      return;
    }

    sessionStorage.setItem(key, buildId);
  } catch {
    /* offline / first deploy without version.json */
  }
}
