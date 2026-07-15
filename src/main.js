import {
  loadApartments,
  loadConfig,
} from './lib/storage.js';
import { trackEvent } from './lib/tracker.js';
import {
  buildContactMessage,
  openContactChannel,
  getContactLabel,
} from './lib/messaging.js';
import { resolveApartmentImage } from './lib/linkPreview.js';

let config = {};
let apartments = [];
let currentApartment = null;

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

async function renderApartments() {
  const grid = document.getElementById('apartments-grid');
  const empty = document.getElementById('empty-state');
  const active = apartments.filter((a) => a.active !== false);

  if (active.length === 0) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  const cards = await Promise.all(
    active.map(async (apt) => {
      const viewedKey = `rt_viewed_${apt.id}`;
      if (!sessionStorage.getItem(viewedKey)) {
        await trackEvent('view', apt.id, config);
        sessionStorage.setItem(viewedKey, '1');
      }

      const imageUrl = await resolveApartmentImage(apt, config);

      return `
        <article class="apartment-card" data-id="${apt.id}">
          <div class="card-image">
            ${imageUrl
              ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(apt.title)}" loading="lazy" onerror="this.classList.add('img-fallback-hidden');this.nextElementSibling.hidden=false" /><span class="img-placeholder" hidden>🏠</span>`
              : '<span class="img-placeholder">🏠</span>'}
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
              ${
                apt.contactType === 'phone' && apt.landlordContact
                  ? `<button class="btn btn-success btn-sm contact-landlord" data-id="${apt.id}">💬 WhatsApp landlord</button>`
                  : `<button class="btn btn-success btn-sm contact-landlord" data-id="${apt.id}">${getContactLabel(apt.contactType)}</button>`
              }
              ${apt.listingUrl ? `<button class="btn btn-secondary btn-sm view-listing" data-id="${apt.id}" data-url="${escapeHtml(apt.listingUrl)}">🔗 View original listing</button>` : ''}
            </div>
          </div>
        </article>
      `;
    })
  );

  grid.innerHTML = cards.join('');
  bindCardEvents();
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

init();
