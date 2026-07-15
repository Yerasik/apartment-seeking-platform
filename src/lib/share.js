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
