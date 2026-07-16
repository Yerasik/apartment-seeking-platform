export function getSiteUrl(config = {}) {
  const configured = config.siteUrl?.trim().replace(/\/$/, '');
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${window.location.origin}${base}`;
  }

  return 'https://yerasik.github.io/apartment-seeking-platform';
}

export function buildListingShareUrl(apartment, config = {}) {
  return `${getSiteUrl(config)}/listings/${apartment.id}.html`;
}

export async function checkSharePageLive(shareUrl) {
  try {
    const res = await fetch(shareUrl, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return null;
  }
}

export const DEPLOY_SHARE_HINT =
  'Copy apartments.json → paste into public/data/apartments.json on GitHub → wait ~2 min for deploy.';
