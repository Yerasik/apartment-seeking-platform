export function getSiteUrl(config = {}) {
  const configured = config.siteUrl?.trim().replace(/\/$/, '');
  if (configured) {
    // Collapse accidental duplicated repo path
    return configured.replace(
      /^(https?:\/\/[^/]+\/apartment-seeking-platform)(?:\/apartment-seeking-platform)+/i,
      '$1'
    );
  }

  if (typeof window !== 'undefined') {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${window.location.origin}${base}`;
  }

  return 'https://yerasik.github.io/apartment-seeking-platform';
}

export function buildListingShareUrl(apartment, config = {}) {
  const root = getSiteUrl(config);
  return `${root}/listings/${apartment.id}.html`;
}

export function buildAllListingsUrl(config = {}) {
  return `${getSiteUrl(config)}/#listings`;
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
