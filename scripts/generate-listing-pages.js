import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchListingDetails } from '../src/lib/listingExtractors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const listingsDir = path.join(root, 'public', 'listings');

function readJson(relativePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch {
    return fallback;
  }
}

/** Join site root + path without doubling /apartment-seeking-platform. */
function sitePath(siteRoot, ...parts) {
  const rootUrl = String(siteRoot || '').replace(/\/$/, '');
  const suffix = parts
    .filter(Boolean)
    .map((p) => String(p).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  if (!suffix) return `${rootUrl}/`;
  // Avoid …/apartment-seeking-platform/apartment-seeking-platform/…
  if (suffix.startsWith('apartment-seeking-platform/')) {
    return `${rootUrl}/${suffix.slice('apartment-seeking-platform/'.length)}`;
  }
  return `${rootUrl}/${suffix}`;
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
  const listingLink = apt.listingUrl?.trim() || `${config.siteUrl || ''}/listings/${apt.id}.html`;
  return formatTemplate(
    config.contactMessageTemplate ||
      "Hello! I'm from the {groupName} community. I'm interested in this listing:\n{listingUrl}\n\nCould you share more details? Thank you!",
    {
      groupName: config.groupName || 'Renting Together',
      listingUrl: listingLink,
      title: apt.title || '',
    }
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function resolveFlatImage(apt) {
  const media = collectApartmentMedia(apt);
  const firstImage = media.find((m) => m.type === 'image' && m.url.startsWith('http'));
  if (firstImage) return firstImage.url;

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

/** Public HTTPS media only (skip huge data: URLs in static pages). */
function collectApartmentMedia(apt) {
  const list = [];
  const seen = new Set();

  const push = (type, url) => {
    if (!url || typeof url !== 'string') return;
    if (!url.startsWith('http')) return;
    if (seen.has(url)) return;
    seen.add(url);
    list.push({ type: type === 'video' ? 'video' : 'image', url });
  };

  if (Array.isArray(apt.media)) {
    for (const item of apt.media) {
      push(item?.type || 'image', item?.url);
    }
  }
  if (Array.isArray(apt.images)) {
    for (const url of apt.images) push('image', url);
  }
  push('image', apt.imageUrl);
  push('video', apt.videoUrl);

  return list;
}

function buildGalleryHtml(media, title) {
  if (!media.length) {
    return '<div class="hero"><div class="hero-placeholder">🏠</div></div>';
  }

  const slides = media
    .map((item, i) => {
      if (item.type === 'video') {
        return `<div class="slide${i === 0 ? ' active' : ''}" data-index="${i}">
          <video src="${escapeHtml(item.url)}" controls playsinline preload="metadata"></video>
        </div>`;
      }
      return `<div class="slide${i === 0 ? ' active' : ''}" data-index="${i}">
        <img src="${escapeHtml(item.url)}" alt="${escapeHtml(title)} photo ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" />
      </div>`;
    })
    .join('');

  const dots =
    media.length > 1
      ? `<div class="gallery-dots">${media
          .map(
            (_, i) =>
              `<button type="button" class="dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Photo ${i + 1}"></button>`
          )
          .join('')}</div>`
      : '';

  const nav =
    media.length > 1
      ? `<button type="button" class="gallery-btn prev" aria-label="Previous photo">‹</button>
         <button type="button" class="gallery-btn next" aria-label="Next photo">›</button>
         <div class="gallery-count"><span id="gallery-pos">1</span> / ${media.length}</div>`
      : '';

  const thumbs =
    media.length > 1
      ? `<div class="thumbs">${media
          .map((item, i) =>
            item.type === 'video'
              ? `<button type="button" class="thumb${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Video ${i + 1}"><span class="thumb-video">▶</span></button>`
              : `<button type="button" class="thumb${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Photo ${i + 1}"><img src="${escapeHtml(item.url)}" alt="" loading="lazy" /></button>`
          )
          .join('')}</div>`
      : '';

  return `<div class="gallery" id="gallery" data-count="${media.length}">
    <div class="hero slides">${slides}${nav}${dots}</div>
    ${thumbs}
  </div>
  <script>
  (function () {
    var gallery = document.getElementById('gallery');
    if (!gallery) return;
    var count = Number(gallery.getAttribute('data-count') || 1);
    if (count < 2) return;
    var index = 0;
    var slides = gallery.querySelectorAll('.slide');
    var dots = gallery.querySelectorAll('.dot');
    var thumbs = gallery.querySelectorAll('.thumb');
    var pos = document.getElementById('gallery-pos');
    function show(i) {
      index = (i + count) % count;
      slides.forEach(function (s, n) { s.classList.toggle('active', n === index); });
      dots.forEach(function (d, n) { d.classList.toggle('active', n === index); });
      thumbs.forEach(function (t, n) { t.classList.toggle('active', n === index); });
      if (pos) pos.textContent = String(index + 1);
      slides.forEach(function (s) {
        var v = s.querySelector('video');
        if (v && !s.classList.contains('active')) { try { v.pause(); } catch (e) {} }
      });
    }
    gallery.querySelector('.prev')?.addEventListener('click', function () { show(index - 1); });
    gallery.querySelector('.next')?.addEventListener('click', function () { show(index + 1); });
    dots.forEach(function (d) { d.addEventListener('click', function () { show(Number(d.dataset.index)); }); });
    thumbs.forEach(function (t) { t.addEventListener('click', function () { show(Number(t.dataset.index)); }); });
    var startX = 0;
    var hero = gallery.querySelector('.hero');
    hero.addEventListener('touchstart', function (e) { startX = e.changedTouches[0].screenX; }, { passive: true });
    hero.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].screenX - startX;
      if (Math.abs(dx) < 40) return;
      show(index + (dx < 0 ? 1 : -1));
    }, { passive: true });
  })();
  </script>`;
}

function buildTrackingScript(aptId, config) {
  const url = (config.supabaseUrl || process.env.SUPABASE_URL || '').trim();
  const key = (config.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) {
    return '';
  }

  const urlJson = JSON.stringify(url);
  const keyJson = JSON.stringify(key);
  const id = JSON.stringify(aptId);

  return `<script>
(function () {
  var cfg = { url: ${urlJson}, key: ${keyJson}, id: ${id} };
  function track(type) {
    fetch(cfg.url + '/rest/v1/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_type: type,
        apartment_id: cfg.id,
        metadata: { page: 'share' },
        created_at: new Date().toISOString(),
      }),
    }).catch(function () {});
  }
  track('view');
  var listing = document.querySelector('.btn-listing');
  if (listing) listing.addEventListener('click', function () { track('click'); });
  var wa = document.querySelector('.btn-wa');
  if (wa) wa.addEventListener('click', function () { track('message'); });
})();
</script>`;
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

  const pageUrl = sitePath(siteUrl, 'listings', `${apt.id}.html`);
  const allListingsUrl = `${siteUrl}/#listings`;
  let media = collectApartmentMedia(apt);
  const imageUrl = media.find((m) => m.type === 'image')?.url || (await resolveFlatImage(apt));
  if (imageUrl && !media.some((m) => m.url === imageUrl)) {
    media = [{ type: 'image', url: imageUrl }, ...media];
  }
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

  const galleryHtml = buildGalleryHtml(media, apt.title);

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
      .hero { position: relative; background: #dce8e2; }
      .slides { position: relative; min-height: 260px; }
      .slide { display: none; }
      .slide.active { display: block; }
      .hero img, .hero video {
        width: 100%;
        height: 280px;
        object-fit: cover;
        display: block;
        background: #dce8e2;
      }
      .hero-placeholder {
        height: 260px;
        display: grid;
        place-items: center;
        font-size: 4rem;
        background: #dce8e2;
      }
      .gallery-btn {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 50%;
        background: rgba(0,0,0,.45);
        color: #fff;
        font-size: 1.4rem;
        cursor: pointer;
        z-index: 2;
        line-height: 1;
      }
      .gallery-btn.prev { left: .6rem; }
      .gallery-btn.next { right: .6rem; }
      .gallery-count {
        position: absolute;
        top: .6rem;
        right: .6rem;
        background: rgba(0,0,0,.5);
        color: #fff;
        font-size: .75rem;
        padding: .2rem .5rem;
        border-radius: 999px;
        z-index: 2;
      }
      .gallery-dots {
        position: absolute;
        bottom: .65rem;
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        gap: .35rem;
        z-index: 2;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        border: none;
        background: rgba(255,255,255,.45);
        cursor: pointer;
        padding: 0;
      }
      .dot.active { background: #fff; }
      .thumbs {
        display: flex;
        gap: .4rem;
        padding: .65rem .75rem 0;
        overflow-x: auto;
      }
      .thumb {
        flex: 0 0 56px;
        width: 56px;
        height: 44px;
        border: 2px solid transparent;
        border-radius: 8px;
        overflow: hidden;
        padding: 0;
        background: #dce8e2;
        cursor: pointer;
      }
      .thumb.active { border-color: #1a5f4a; }
      .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .thumb-video {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        color: #1a5f4a;
        font-size: .85rem;
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
        ${galleryHtml}
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
                ? `<a class="btn btn-wa" href="${escapeHtml(whatsappHref)}">💬 WhatsApp agent</a>`
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
    ${buildTrackingScript(apt.id, config)}
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
