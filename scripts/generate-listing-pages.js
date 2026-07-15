import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchListingDetails } from '../src/lib/listingExtractors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const listingsDir = path.join(root, 'public', 'listings');

const basePath =
  process.env.GITHUB_PAGES === 'true' ? '/apartment-seeking-platform' : '';

function readJson(relativePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch {
    return fallback;
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(price, currency) {
  const amount = Number(price).toLocaleString('en-HK');
  if (currency === 'HKD') return `HK$${amount}`;
  return `${currency} ${amount}`;
}

function formatTemplate(template, data) {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] ?? '');
}

function buildContactMessage(apt, config) {
  const base = formatTemplate(config.contactMessageTemplate || '', {
    groupName: config.groupName || 'Renting Together',
    title: apt.title,
    address: apt.address,
    price: apt.price,
    currency: apt.currency,
  });

  const details = [
    apt.rooms ? `${apt.rooms} room(s)` : null,
    apt.kitchen ? `Kitchen: ${apt.kitchen}` : null,
    apt.availableFrom ? `Available from: ${apt.availableFrom}` : null,
    apt.listingUrl ? `Listing: ${apt.listingUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return details ? `${base}\n\n${details}` : base;
}

async function resolveFlatImage(apt) {
  if (apt.imageUrl?.startsWith('http')) {
    return apt.imageUrl;
  }

  if (!apt.listingUrl?.startsWith('http')) {
    return '';
  }

  try {
    const details = await fetchListingDetails(apt.listingUrl, {});
    if (details?.imageUrl?.startsWith('http')) {
      return details.imageUrl;
    }
  } catch {
    /* try markdown fallback below */
  }

  try {
    const res = await fetch(`https://r.jina.ai/${apt.listingUrl}`);
    if (!res.ok) return '';

    const text = await res.text();
    const patterns = [
      /https:\/\/i\d+\.28hse\.com\/[^\s)"']+_large\.jpg/gi,
      /https:\/\/cdn\.spacious\.hk\/[^\s)"']+large_thumb-[^)\s"']+\.jpg/gi,
      /https:\/\/cdn\.spacious\.hk\/[^\s)"']+thumb-[^)\s"']+\.jpg/gi,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[0]) return match[0];
    }
  } catch {
    return '';
  }

  return '';
}

function kitchenLabel(kitchen) {
  const labels = {
    separate: 'Separate kitchen',
    kitchenette: 'Kitchenette',
    shared: 'Shared kitchen',
    none: 'No kitchen',
  };
  return labels[kitchen] || kitchen || '';
}

const config = readJson('public/data/config.json', {});
const apartments = readJson('public/data/apartments.json', []);
const siteUrl = (config.siteUrl || 'https://yerasik.github.io/apartment-seeking-platform').replace(
  /\/$/,
  ''
);

fs.mkdirSync(listingsDir, { recursive: true });

const activeIds = new Set();
let withPhoto = 0;

for (const apt of apartments) {
  if (apt.active === false || !apt.id) continue;

  activeIds.add(apt.id);

  const pageUrl = `${siteUrl}${basePath}/listings/${apt.id}.html`;
  const allListingsUrl = `${siteUrl}${basePath}/index.html#${apt.id}`;
  const imageUrl = await resolveFlatImage(apt);
  if (imageUrl) withPhoto += 1;

  const pageTitle = `${apt.title} — ${config.siteName || 'Renting Together'}`;
  const description = `${formatPrice(apt.price, apt.currency)}/month · ${apt.address || apt.title}`;
  const contactMessage = buildContactMessage(apt, config);
  const whatsappHref =
    apt.contactType === 'phone' && apt.landlordContact
      ? `https://wa.me/${apt.landlordContact.replace(/\D/g, '')}?text=${encodeURIComponent(contactMessage)}`
      : '';

  const ogImageTags = imageUrl
    ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`
    : '';

  const heroImage = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(apt.title)}" />`
    : '<div class="hero-placeholder">🏠</div>';

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(config.siteName || 'Renting Together')}" />
    <meta property="og:title" content="${escapeHtml(apt.title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${ogImageTags}
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: system-ui, -apple-system, sans-serif;
        background: #f4f7f5;
        color: #1a2e24;
        min-height: 100vh;
        padding: 1.5rem;
      }
      .wrap { max-width: 520px; margin: 0 auto; }
      .card {
        background: #fff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,.08);
      }
      .hero img { width: 100%; height: 260px; object-fit: cover; display: block; background: #dce8e2; }
      .hero-placeholder {
        height: 260px;
        display: grid;
        place-items: center;
        font-size: 4rem;
        background: #dce8e2;
      }
      .body { padding: 1.25rem 1.5rem 1.5rem; }
      .brand { color: #1a5f4a; font-size: .85rem; font-weight: 600; margin-bottom: .5rem; }
      h1 { font-size: 1.35rem; line-height: 1.3; margin-bottom: .5rem; }
      .address { color: #5a6b62; margin-bottom: .75rem; }
      .price { font-size: 1.5rem; font-weight: 700; color: #1a5f4a; margin-bottom: 1rem; }
      .price span { font-size: .95rem; font-weight: 500; color: #5a6b62; }
      .details { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
      .badge { background: #eef5f1; color: #1a5f4a; padding: .35rem .65rem; border-radius: 999px; font-size: .8rem; }
      .desc { color: #3d4f45; line-height: 1.5; margin-bottom: 1.25rem; font-size: .95rem; }
      .actions { display: flex; flex-direction: column; gap: .65rem; }
      .btn {
        display: block;
        text-align: center;
        text-decoration: none;
        padding: .85rem 1rem;
        border-radius: 10px;
        font-weight: 600;
        font-size: .95rem;
      }
      .btn-wa { background: #25d366; color: #fff; }
      .btn-listing { background: #1a5f4a; color: #fff; }
      .btn-all { background: #eef5f1; color: #1a5f4a; }
      .footer { text-align: center; margin-top: 1rem; color: #5a6b62; font-size: .85rem; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="hero">
          ${heroImage}
        </div>
        <div class="body">
          <div class="brand">${escapeHtml(config.siteName || 'Renting Together')}</div>
          <h1>${escapeHtml(apt.title)}</h1>
          <p class="address">📍 ${escapeHtml(apt.address || '')}</p>
          <div class="price">${escapeHtml(formatPrice(apt.price, apt.currency))} <span>/ month</span></div>
          <div class="details">
            ${apt.rooms ? `<span class="badge">🛏 ${apt.rooms} room(s)</span>` : ''}
            ${apt.kitchen ? `<span class="badge">🍳 ${escapeHtml(kitchenLabel(apt.kitchen))}</span>` : ''}
            ${apt.furnished ? '<span class="badge">🪑 Furnished</span>' : ''}
          </div>
          ${apt.description ? `<p class="desc">${escapeHtml(apt.description)}</p>` : ''}
          <div class="actions">
            ${
              whatsappHref
                ? `<a class="btn btn-wa" href="${escapeHtml(whatsappHref)}">💬 WhatsApp landlord</a>`
                : ''
            }
            ${
              apt.listingUrl
                ? `<a class="btn btn-listing" href="${escapeHtml(apt.listingUrl)}" target="_blank" rel="noopener">🔗 View original listing</a>`
                : ''
            }
            <a class="btn btn-all" href="${escapeHtml(allListingsUrl)}">See all flats</a>
          </div>
        </div>
      </div>
      <p class="footer">Part of the ${escapeHtml(config.groupName || 'Renting Together')} community</p>
    </div>
  </body>
</html>
`;

  fs.writeFileSync(path.join(listingsDir, `${apt.id}.html`), html);

  if (!imageUrl) {
    console.warn(`  ⚠ ${apt.id}: no photo URL — add a 28Hse/Spacious link for WhatsApp preview`);
  }
}

for (const file of fs.readdirSync(listingsDir)) {
  if (!file.endsWith('.html')) continue;
  const id = file.replace(/\.html$/, '');
  if (!activeIds.has(id)) {
    fs.unlinkSync(path.join(listingsDir, file));
  }
}

console.log(
  `Generated ${activeIds.size} listing share page(s) (${withPhoto} with flat photos for WhatsApp preview)`
);
