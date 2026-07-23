import {
  loadApartments,
  loadConfig,
  sortApartmentsNewestFirst,
} from './lib/storage.js';
import { trackEvent } from './lib/tracker.js';
import {
  buildContactMessage,
  openContactChannel,
  getContactLabel,
} from './lib/messaging.js';
import { resolveApartmentImage } from './lib/linkPreview.js';
import { apartmentMedia, coverImageUrl } from './lib/mediaUpload.js';
import { buildListingShareUrl } from './lib/share.js';

let config = {};
let apartments = [];
let currentApartment = null;
const galleryById = new Map();

async function init() {
  [config, apartments] = await Promise.all([loadConfig(), loadApartments()]);
  applyBranding();
  renderListingCount();
  await renderApartments();
  scrollToListingFromHash();
  window.addEventListener('hashchange', scrollToListingFromHash);
  setupModal();
}

function applyBranding() {
  document.title = `${config.siteName} — Flat Listings`;
  document.getElementById('site-name').textContent = config.siteName;
  document.getElementById('site-tagline').textContent = config.tagline;
  document.getElementById('footer-group').textContent = config.groupName;
}

function renderListingCount() {
  const active = apartments.filter((a) => a.active !== false);
  document.getElementById('stat-listings').textContent = active.length;
}

function kitchenLabel(kitchen) {
  const labels = {
    separate: 'Separate kitchen',
    kitchenette: 'Kitchenette',
    shared: 'Shared kitchen',
    none: 'No kitchen',
  };
  return labels[kitchen] || kitchen;
}

async function buildCardHtml(apt) {
  const viewedKey = `rt_viewed_${apt.id}`;
  if (!sessionStorage.getItem(viewedKey)) {
    await trackEvent('view', apt.id, config);
    sessionStorage.setItem(viewedKey, '1');
  }

  const media = apartmentMedia(apt);
  let cover = coverImageUrl(apt);
  if (!cover) {
    cover = await resolveApartmentImage(apt, config);
  }

  const gallery = media.length
    ? media
    : cover
      ? [{ type: 'image', url: cover }]
      : [];
  galleryById.set(apt.id, gallery);

  const first = gallery[0];
  const mediaHtml = first
    ? first.type === 'video'
      ? `<video class="gallery-main" src="${escapeAttr(first.url)}" controls playsinline preload="metadata"></video>`
      : `<img class="gallery-main" src="${escapeAttr(first.url)}" alt="${escapeHtml(apt.title)}" loading="lazy" onerror="this.classList.add('img-fallback-hidden');this.nextElementSibling.hidden=false" /><span class="img-placeholder" hidden>🏠</span>`
    : '<span class="img-placeholder">🏠</span>';

  return `
    <article class="apartment-card${apt.featured ? ' is-featured' : ''}" data-id="${apt.id}">
      <div class="card-image${gallery.length > 1 ? ' has-gallery' : ''}" data-apt-id="${apt.id}">
        ${apt.featured ? '<span class="featured-badge">Top pick</span>' : ''}
        <a class="card-image-link" href="${escapeAttr(buildListingShareUrl(apt, config))}" aria-label="View all photos">
        ${mediaHtml}
        </a>
        ${
          gallery.length > 1
            ? `<button type="button" class="gallery-nav gallery-prev" aria-label="Previous">‹</button>
               <button type="button" class="gallery-nav gallery-next" aria-label="Next">›</button>
               <div class="gallery-dots">${gallery
                 .map(
                   (_, i) =>
                     `<button type="button" class="gallery-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Media ${i + 1}"></button>`
                 )
                 .join('')}</div>`
            : ''
        }
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(apt.title)}</h3>
        <p class="card-address">📍 ${escapeHtml(apt.address)}</p>
        <div class="card-price">${apt.price} <span>${apt.currency}/month</span></div>
        <div class="card-details">
          <span class="detail-badge">🛏 ${apt.rooms} room(s)</span>
          <span class="detail-badge">🍳 ${kitchenLabel(apt.kitchen)}</span>
          ${apt.bathroom ? `<span class="detail-badge">🚿 ${apt.bathroom}</span>` : ''}
          ${apt.furnished ? '<span class="detail-badge">🪑 Furnished</span>' : ''}
          ${apt.availableFrom ? `<span class="detail-badge">📅 ${apt.availableFrom}</span>` : ''}
        </div>
        ${apt.description ? `<p class="card-description">${escapeHtml(apt.description)}</p>` : ''}
        ${apt.tags?.length ? `<div class="card-tags">${apt.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="card-actions">
          <a class="btn btn-primary btn-sm" href="${escapeAttr(buildListingShareUrl(apt, config))}">🖼 View all photos</a>
          ${
            apt.contactType === 'phone' && apt.landlordContact
? `<button class="btn btn-success btn-sm contact-landlord" data-id="${apt.id}">💬 WhatsApp agent</button>`
                  : `<button class="btn btn-success btn-sm contact-landlord" data-id="${apt.id}">${getContactLabel(apt.contactType)}</button>`
          }
          ${apt.listingUrl ? `<button class="btn btn-secondary btn-sm view-listing" data-id="${apt.id}" data-url="${escapeAttr(apt.listingUrl)}">🔗 View original listing</button>` : ''}
        </div>
      </div>
    </article>
  `;
}

async function renderApartments() {
  const topSection = document.getElementById('top-listings');
  const topGrid = document.getElementById('top-listings-grid');
  const allHeading = document.getElementById('all-listings-heading');
  const grid = document.getElementById('apartments-grid');
  const empty = document.getElementById('empty-state');
  const active = sortApartmentsNewestFirst(apartments.filter((a) => a.active !== false));

  galleryById.clear();

  if (active.length === 0) {
    topSection.hidden = true;
    topGrid.innerHTML = '';
    allHeading.hidden = true;
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  const featured = active.filter((a) => a.featured);
  const rest = active.filter((a) => !a.featured);

  if (featured.length) {
    topSection.hidden = false;
    topGrid.innerHTML = (await Promise.all(featured.map(buildCardHtml))).join('');
  } else {
    topSection.hidden = true;
    topGrid.innerHTML = '';
  }

  allHeading.hidden = !(featured.length && rest.length);
  grid.innerHTML = (await Promise.all(rest.map(buildCardHtml))).join('');

  bindCardEvents();
  bindGalleries();
}

function bindGalleries() {
  document.querySelectorAll('.card-image.has-gallery').forEach((el) => {
    const gallery = galleryById.get(el.dataset.aptId) || [];
    if (gallery.length < 2) return;

    let index = 0;
    const host = el;
    const dots = el.querySelectorAll('.gallery-dot');

    const show = (i) => {
      index = (i + gallery.length) % gallery.length;
      const item = gallery[index];
      const existing = host.querySelector('.gallery-main');
      const placeholder = host.querySelector('.img-placeholder');
      if (!existing) return;

      if (item.type === 'video') {
        const video = document.createElement('video');
        video.className = 'gallery-main';
        video.src = item.url;
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        existing.replaceWith(video);
        if (placeholder) placeholder.hidden = true;
      } else {
        if (existing.tagName === 'VIDEO') {
          const img = document.createElement('img');
          img.className = 'gallery-main';
          img.src = item.url;
          img.loading = 'lazy';
          img.alt = '';
          existing.replaceWith(img);
        } else {
          existing.src = item.url;
          existing.classList.remove('img-fallback-hidden');
        }
        if (placeholder) placeholder.hidden = true;
      }
      dots.forEach((d, di) => d.classList.toggle('active', di === index));
    };

    el.querySelector('.gallery-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      show(index - 1);
    });
    el.querySelector('.gallery-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      show(index + 1);
    });
    dots.forEach((dot) => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        show(Number(dot.dataset.index));
      });
    });
  });
}

function scrollToListingFromHash() {
  const id = location.hash.replace('#', '');
  if (!id) return;

  const card = document.querySelector(`.apartment-card[data-id="${id}"]`);
  if (!card) return;

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('card-highlight');
  setTimeout(() => card.classList.remove('card-highlight'), 2500);
}

function bindCardEvents() {
  document.querySelectorAll('.view-listing').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const url = btn.dataset.url;
      await trackEvent('click', id, config);
      window.open(url, '_blank', 'noopener');
    });
  });

  document.querySelectorAll('.contact-landlord').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const apt = apartments.find((a) => a.id === btn.dataset.id);
      if (!apt) return;

      if (apt.contactType === 'phone' && apt.landlordContact) {
        const message = buildContactMessage(apt, config);
        await trackEvent('message', apt.id, config);
        openContactChannel(apt, message);
        return;
      }

      openContactModal(apt);
    });
  });
}

function openContactModal(apt) {
  currentApartment = apt;
  const message = buildContactMessage(apt, config);
  document.getElementById('message-preview').textContent = message;
  document.getElementById('contact-modal').classList.add('open');
}

function setupModal() {
  const modal = document.getElementById('contact-modal');

  document.getElementById('modal-close').addEventListener('click', () => {
    modal.classList.remove('open');
    currentApartment = null;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
      currentApartment = null;
    }
  });

  document.getElementById('send-message').addEventListener('click', async () => {
    if (!currentApartment) return;
    const message = buildContactMessage(currentApartment, config);
    await trackEvent('message', currentApartment.id, config);
    openContactChannel(currentApartment, message);
    modal.classList.remove('open');
    showCopyFeedback('Opening contact channel…');
  });
}

function showCopyFeedback(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast success';
  toast.textContent = msg;
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;');
}

init();
