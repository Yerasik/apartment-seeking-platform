import { detectListingSite, fetchListingDetails } from './listingExtractors.js';

const CACHE_KEY = 'rt_image_cache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(cache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function getCachedPreview(url) {
  const entry = readCache()[url];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
  return entry;
}

function cachePreview(url, data) {
  const cache = readCache();
  cache[url] = { ...data, fetchedAt: Date.now() };
  writeCache(cache);
}

async function fetchFromMicrolink(url) {
  const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`Preview service unavailable (${res.status})`);

  const json = await res.json();
  const imageUrl = json?.data?.image?.url || json?.data?.logo?.url || '';

  return {
    imageUrl,
    title: json?.data?.title || '',
    description: json?.data?.description || '',
  };
}

async function fetchFromJsonLink(url) {
  const apiUrl = `https://jsonlink.io/api/extract?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`Fallback preview failed (${res.status})`);

  const json = await res.json();
  const imageUrl = json?.images?.[0] || json?.og?.image || '';

  return {
    imageUrl,
    title: json?.title || json?.og?.title || '',
    description: json?.description || json?.og?.description || '',
  };
}

/**
 * Fetch Open Graph preview data (image, title, description) from a listing URL.
 * Works like WhatsApp link previews — no need to save images manually.
 */
const EMPTY_PREVIEW = {
  imageUrl: '',
  title: '',
  description: '',
  address: '',
  price: undefined,
  currency: '',
  rooms: undefined,
  kitchen: '',
  bathroom: '',
  furnished: undefined,
  tags: [],
  source: 'none',
};

export async function fetchListingPreview(url, config = {}) {
  if (!url) {
    return { ...EMPTY_PREVIEW };
  }

  const cached = getCachedPreview(url);
  if (cached?.imageUrl || cached?.title) {
    return { ...EMPTY_PREVIEW, ...cached, source: 'cache' };
  }

  let ogResult = null;

  const customApi = config.linkPreviewApiUrl?.trim();
  if (customApi) {
    const res = await fetch(`${customApi}${customApi.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const json = await res.json();
      ogResult = {
        imageUrl: json.imageUrl || json.image || json?.data?.image?.url || '',
        title: json.title || json?.data?.title || '',
        description: json.description || json?.data?.description || '',
        source: 'custom',
      };
    }
  }

  if (!ogResult) {
    try {
      ogResult = await fetchFromMicrolink(url);
      ogResult.source = 'microlink';
    } catch {
      try {
        ogResult = await fetchFromJsonLink(url);
        ogResult.source = 'jsonlink';
      } catch {
        ogResult = { imageUrl: '', title: '', description: '', source: 'none' };
      }
    }
  }

  let result = { ...EMPTY_PREVIEW, ...ogResult };

  if (detectListingSite(url)) {
    try {
      const details = await fetchListingDetails(url, ogResult);
      if (details) {
        result = {
          ...result,
          ...details,
          imageUrl: details.imageUrl || result.imageUrl,
          title: details.title || result.title,
          description: details.description || result.description,
        };
      }
    } catch {
      /* fall back to OG preview only */
    }
  }

  if (result.imageUrl || result.title) {
    cachePreview(url, result);
  }

  return result;
}

/**
 * Resolve the best image for an apartment: manual URL first, then auto-fetch from listing link.
 */
export async function resolveApartmentImage(apartment, config = {}) {
  if (apartment.imageUrl) {
    return apartment.imageUrl;
  }

  if (!apartment.listingUrl) {
    return '';
  }

  const cached = getCachedPreview(apartment.listingUrl);
  if (cached?.imageUrl) {
    return cached.imageUrl;
  }

  try {
    const preview = await fetchListingPreview(apartment.listingUrl, config);
    return preview.imageUrl || '';
  } catch {
    return '';
  }
}

export async function fetchListingImage(url, config = {}) {
  const preview = await fetchListingPreview(url, config);
  return preview.imageUrl || '';
}
