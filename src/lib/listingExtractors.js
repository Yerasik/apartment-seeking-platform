const JINA_READER = 'https://r.jina.ai/';

export function detectListingSite(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === '28hse.com') return '28hse';
    if (host === 'spacious.hk') return 'spacious';
    return null;
  } catch {
    return null;
  }
}

async function fetchPageMarkdown(url) {
  const res = await fetch(`${JINA_READER}${url}`);
  if (!res.ok) throw new Error(`Could not read listing page (${res.status})`);
  return res.text();
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function parsePrice(text) {
  const match = firstMatch(text, [
    /Lease\s+HKD?\$?\s*([\d,]+)/i,
    /HK\$\s*([\d,]+)/,
    /HKD?\$?\s*([\d,]+)/i,
  ]);
  return match ? Number(match[1].replace(/,/g, '')) : undefined;
}

function parseKitchen(text) {
  const lower = text.toLowerCase();
  if (lower.includes('no kitchen')) return 'none';
  if (lower.includes('shared kitchen')) return 'shared';
  if (lower.includes('kitchenette')) return 'kitchenette';
  if (lower.includes('separate kitchen')) return 'separate';
  return undefined;
}

function parseFurnished(text) {
  if (/with furniture|furniture included|furnished/i.test(text)) return true;
  if (/unfurnished|without furniture/i.test(text)) return false;
  return undefined;
}

function parse28hse(markdown, url) {
  const adTitle = markdown.match(/《([^》]+)》/)?.[1]?.trim();
  const headline = markdown.match(/Id#\s*\d+[\s\S]*?\n\n([^\n]+)/)?.[1]?.trim();
  const estate = markdown.match(/Estate\s+([^\n]+)/)?.[1]?.trim();
  const area = markdown.match(
    /Estate[^\n]+\n+\s*(HK Island[^\n]+|Kowloon[^\n]+|New Territories[^\n]+)/i
  )?.[1]?.trim();
  const unit = markdown.match(/Block and Unit:\s*([^\n]+)/i)?.[1]?.trim();

  const title =
    adTitle ||
    (estate ? `${estate}${unit ? ` · Unit ${unit}` : ''}` : '') ||
    headline ||
    '';

  const addressParts = [area, estate, unit ? `Unit ${unit}` : ''].filter(Boolean);
  const address = addressParts.join(', ');

  const roomLine = markdown.match(/Room and Bathroom\s+([^\n]+)/i)?.[1] || '';
  const rooms = /studio/i.test(roomLine)
    ? 1
    : Number(roomLine.match(/(\d+)\s*bed/i)?.[1]) || 1;

  const bathroom = /shared/i.test(roomLine) ? 'shared' : 'private';

  const description =
    markdown.match(/\n\s*([A-Z][^\n]{20,}?\.)\s*\n\s*\nApartment/i)?.[1]?.trim() ||
    markdown.match(
      /\n\s*(The building features[^\n]+(?:station|located)[^\n.]*\.)/i
    )?.[1]?.trim() ||
    headline ||
    '';

  const imageUrls = [
    ...markdown.matchAll(/https:\/\/i\d+\.28hse\.com\/[^\s)"']+_large\.jpg/gi),
    ...markdown.matchAll(/https:\/\/i\d+\.28hse\.com\/[^\s)"']+\.jpg/gi),
  ].map((m) => m[0]);

  const tags = [];
  if (/mtr nearby/i.test(markdown)) tags.push('mtr-nearby');
  if (/with furniture/i.test(markdown)) tags.push('furnished');
  if (/pet/i.test(markdown)) tags.push('pet-friendly');

  return {
    title,
    address,
    price: parsePrice(markdown),
    currency: 'HKD',
    rooms,
    kitchen: parseKitchen(markdown) || 'separate',
    bathroom,
    furnished: parseFurnished(markdown),
    description,
    imageUrl: imageUrls[0] || '',
    tags,
    listingUrl: url,
    source: '28hse',
  };
}

function parseSpacious(markdown, url, og = {}) {
  const titleMatch = og.title?.match(/For Rent -\s*(.+?),\s*\d+\s*Bed/i);
  const address =
    markdown.match(/\n(\d+[^$\n]+Queen[^$\n]+|[^$\n]+\bRoad\b[^\n$]+)\n\nHK\$/i)?.[1]?.trim() ||
    titleMatch?.[1]?.trim() ||
    markdown.match(/\n(\d+[-\d]*,\s*[^\n]+)\n\nHK\$/i)?.[1]?.trim() ||
    '';

  const title = address || og.title?.replace(/^For Rent -\s*/, '').split(',')[0]?.trim() || '';

  const roomSection = markdown.match(/Studio|(\d+)\s+Bathroom/i);
  const rooms = /studio/i.test(markdown) ? 1 : Number(og.title?.match(/(\d+)\s*Bed/i)?.[1]) || 1;

  const bathroom = /(\d+)\s+Bathroom/i.test(markdown) ? 'private' : 'private';

  const imageUrls = [
    ...markdown.matchAll(
      /https:\/\/cdn\.spacious\.hk\/uploads\/property_image\/[^/]+\/image\/large_thumb-[^)\s"']+\.jpg/gi
    ),
    ...markdown.matchAll(
      /https:\/\/cdn\.spacious\.hk\/uploads\/property_image\/[^/]+\/image\/thumb-[^)\s"']+\.jpg/gi
    ),
  ].map((m) => m[0]);

  const neighbourhood =
    markdown.match(/MTR\s*:\s*\d+\s+mins to\s+([^M\n]+?)MTR Station/i)?.[1]?.trim() ||
    markdown.match(/Within\s+(Sai Ying Pun|Central|Wan Chai|Causeway Bay|North Point|Tsim Sha Tsui|Kowloon Bay|Sha Tin|Tuen Mun|Yuen Long|Tai Po|Fanling|Tsing Yi|Tung Chung|Discovery Bay|[A-Za-z ]{3,30})\s*$/im)?.[1]?.trim();
  const tags = [];
  if (neighbourhood) tags.push(neighbourhood.toLowerCase().replace(/\s+/g, '-'));
  if (/terrace/i.test(markdown)) tags.push('terrace');
  if (/furniture included/i.test(markdown)) tags.push('furnished');

  return {
    title,
    address,
    price: parsePrice(markdown) ?? parsePrice(og.title || ''),
    currency: 'HKD',
    rooms,
    kitchen: parseKitchen(markdown),
    bathroom,
    furnished: parseFurnished(markdown),
    description: og.description || '',
    imageUrl: og.imageUrl || imageUrls[0] || '',
    tags,
    listingUrl: url,
    source: 'spacious',
  };
}

/**
 * Fetch structured listing details for supported HK rental sites.
 */
export async function fetchListingDetails(url, ogPreview = {}) {
  const site = detectListingSite(url);
  if (!site) return null;

  const markdown = await fetchPageMarkdown(url);

  if (site === '28hse') return parse28hse(markdown, url);
  if (site === 'spacious') return parseSpacious(markdown, url, ogPreview);

  return null;
}
