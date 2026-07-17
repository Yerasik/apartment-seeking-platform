import {
  loadApartments,
  loadConfig,
  saveApartments,
  saveConfig,
  generateId,
  copyJsonToClipboard,
  showToast,
} from './lib/storage.js';
import { DEPLOY_SHARE_HINT } from './lib/share.js';
import { getTotalStats, getApartmentStats, resetStats } from './lib/tracker.js';
import { sendCommunityAnnouncement } from './lib/messaging.js';
import { fetchListingPreview } from './lib/linkPreview.js';

const DEFAULT_CURRENCY = 'HKD';

let config = {};
let apartments = [];
let editingId = null;

const loginScreen = document.getElementById('login-screen');
const adminLayout = document.getElementById('admin-layout');

async function init() {
  [config, apartments] = await Promise.all([loadConfig(), loadApartments()]);

  if (sessionStorage.getItem('rt_admin_auth') === 'true') {
    showAdmin();
  }

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pwd = document.getElementById('password').value;
    if (pwd === config.adminPassword) {
      sessionStorage.setItem('rt_admin_auth', 'true');
      showAdmin();
    } else {
      showToast('Wrong password', 'error');
    }
  });

  setupNavigation();
  setupApartmentForm();
  setupImagePaste();
  setupListingPreview();
  setupSettingsForm();
  setupExport();
}

function showAdmin() {
  loginScreen.hidden = true;
  adminLayout.hidden = false;
  renderApartmentsTable();
  renderStats();
  populateSettingsForm();
}

function setupNavigation() {
  document.querySelectorAll('.admin-nav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.admin-section').forEach((s) => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`section-${btn.dataset.section}`).classList.add('active');

      if (btn.dataset.section === 'stats') renderStats();
      if (btn.dataset.section === 'apartments') renderApartmentsTable();
    });
  });
}

async function renderApartmentsTable() {
  const tbody = document.getElementById('apartments-tbody');
  const rows = await Promise.all(
    apartments.map(async (apt) => {
      const stats = await getApartmentStats(apt.id, config);
      return `
        <tr>
          <td>${escapeHtml(apt.title)}</td>
          <td>${apt.price} ${apt.currency}</td>
          <td>${apt.rooms}</td>
          <td>${apt.kitchen}</td>
          <td>${stats.clicks}</td>
          <td>${stats.messages}</td>
          <td>${apt.active !== false ? '✅ Active' : '⏸ Hidden'}</td>
          <td style="white-space: nowrap;">
            <button class="btn btn-secondary btn-sm edit-apt" data-id="${apt.id}">Edit</button>
            <button class="btn btn-success btn-sm announce-apt" data-id="${apt.id}" title="Copy share message">📋</button>
            <button class="btn btn-danger btn-sm delete-apt" data-id="${apt.id}">✕</button>
          </td>
        </tr>
      `;
    })
  );

  tbody.innerHTML = rows.join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No apartments yet</td></tr>';

  tbody.querySelectorAll('.edit-apt').forEach((btn) => {
    btn.addEventListener('click', () => editApartment(btn.dataset.id));
  });

  tbody.querySelectorAll('.delete-apt').forEach((btn) => {
    btn.addEventListener('click', () => deleteApartment(btn.dataset.id));
  });

  tbody.querySelectorAll('.announce-apt').forEach((btn) => {
    btn.addEventListener('click', () => announceApartment(btn.dataset.id));
  });
}

function editApartment(id) {
  const apt = apartments.find((a) => a.id === id);
  if (!apt) return;

  editingId = id;
  document.getElementById('form-title').textContent = 'Edit apartment';
  document.getElementById('apt-id').value = apt.id;
  document.getElementById('apt-title').value = apt.title;
  document.getElementById('apt-address').value = apt.address;
  document.getElementById('apt-price').value = apt.price;
  document.getElementById('apt-currency').value = apt.currency || DEFAULT_CURRENCY;
  document.getElementById('apt-rooms').value = apt.rooms || 1;
  document.getElementById('apt-kitchen').value = apt.kitchen || 'separate';
  document.getElementById('apt-bathroom').value = apt.bathroom || 'private';
  document.getElementById('apt-furnished').value = String(apt.furnished ?? false);
  document.getElementById('apt-available').value = apt.availableFrom || '';
  document.getElementById('apt-listing-url').value = apt.listingUrl || '';
  document.getElementById('apt-image-url').value = apt.imageUrl || '';
  document.getElementById('apt-contact').value = apt.landlordContact || '';
  document.getElementById('apt-contact-type').value = apt.contactType || 'email';
  document.getElementById('apt-description').value = apt.description || '';
  document.getElementById('apt-tags').value = (apt.tags || []).join(', ');
  document.getElementById('apt-active').checked = apt.active !== false;
  document.getElementById('apt-announce').checked = false;

  if (apt.imageUrl) {
    document.getElementById('image-preview').src = apt.imageUrl;
    document.getElementById('image-preview-wrap').hidden = false;
  } else if (apt.listingUrl) {
    document.getElementById('image-preview-wrap').hidden = true;
    loadPreviewFromLink({ showErrors: false, overwrite: false });
  } else {
    document.getElementById('image-preview-wrap').hidden = true;
  }

  switchSection('add');
}

function deleteApartment(id) {
  if (!confirm('Delete this apartment?')) return;
  apartments = apartments.filter((a) => a.id !== id);
  saveApartments(apartments);
  renderApartmentsTable();
  showToast('Apartment deleted');
}

async function announceApartment(id) {
  const apt = apartments.find((a) => a.id === id);
  if (!apt) return;

  const result = await sendCommunityAnnouncement(apt, config);
  if (result.ok) {
    showToast(result.message, result.warning ? 'error' : 'success');
  } else {
    showToast(result.error, 'error');
  }
}

function switchSection(name) {
  document.querySelectorAll('.admin-nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.section === name);
  });
  document.querySelectorAll('.admin-section').forEach((s) => {
    s.classList.toggle('active', s.id === `section-${name}`);
  });
}

function setupImagePaste() {
  document.addEventListener('paste', (e) => {
    const addSection = document.getElementById('section-add');
    if (!addSection?.classList.contains('active')) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;

      const file = item.getAsFile();
      if (!file) continue;

      e.preventDefault();

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        document.getElementById('apt-image-url').value = dataUrl;
        document.getElementById('image-preview').src = dataUrl;
        document.getElementById('image-preview-wrap').hidden = false;
        showToast('Image pasted');
      };
      reader.readAsDataURL(file);
      return;
    }
  });
}

function setupListingPreview() {
  const listingInput = document.getElementById('apt-listing-url');
  const imageInput = document.getElementById('apt-image-url');
  const fetchBtn = document.getElementById('fetch-from-link');
  let fetchTimer;

  fetchBtn.addEventListener('click', () => loadPreviewFromLink({ showErrors: true, overwrite: true }));

  listingInput.addEventListener('paste', () => {
    setTimeout(() => {
      if (listingInput.value.trim()) {
        loadPreviewFromLink({ showErrors: false, overwrite: true });
      }
    }, 0);
  });

  listingInput.addEventListener('blur', () => {
    if (listingInput.value.trim()) {
      loadPreviewFromLink({ showErrors: false, overwrite: false });
    }
  });

  listingInput.addEventListener('input', () => {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
      if (listingInput.value.trim()) {
        loadPreviewFromLink({ showErrors: false, overwrite: false });
      }
    }, 800);
  });
}

function applyFormFromPreview(preview, { overwrite = false } = {}) {
  const setValue = (id, value) => {
    if (value == null || value === '') return;
    const el = document.getElementById(id);
    if (!overwrite && el.value.trim()) return;
    el.value = value;
  };

  setValue('apt-title', preview.title);
  setValue('apt-address', preview.address);
  if (preview.price != null) {
    const priceEl = document.getElementById('apt-price');
    if (overwrite || !priceEl.value) priceEl.value = preview.price;
  }
  setValue('apt-currency', preview.currency || DEFAULT_CURRENCY);
  if (preview.rooms != null) {
    const roomsEl = document.getElementById('apt-rooms');
    if (overwrite || !roomsEl.value || roomsEl.value === '1') roomsEl.value = preview.rooms;
  }
  if (preview.kitchen) {
    const kitchenEl = document.getElementById('apt-kitchen');
    if (overwrite || kitchenEl.value === 'separate') kitchenEl.value = preview.kitchen;
  }
  if (preview.bathroom) {
    const bathEl = document.getElementById('apt-bathroom');
    if (overwrite || bathEl.value === 'private') bathEl.value = preview.bathroom;
  }
  if (preview.furnished != null) {
    const furnEl = document.getElementById('apt-furnished');
    if (overwrite) furnEl.value = String(preview.furnished);
  }
  setValue('apt-description', preview.description?.slice(0, 500));
  if (preview.tags?.length) {
    const tagsEl = document.getElementById('apt-tags');
    if (overwrite || !tagsEl.value.trim()) tagsEl.value = preview.tags.join(', ');
  }

  if (preview.imageUrl) {
    document.getElementById('apt-image-url').value = preview.imageUrl;
    document.getElementById('image-preview').src = preview.imageUrl;
    document.getElementById('image-preview-wrap').hidden = false;
  }
}

async function loadPreviewFromLink({ showErrors = false, overwrite = false } = {}) {
  const listingUrl = document.getElementById('apt-listing-url').value.trim();
  if (!listingUrl) {
    if (showErrors) showToast('Enter a listing URL first', 'error');
    return;
  }

  const fetchBtn = document.getElementById('fetch-from-link');
  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching…';

  try {
    const preview = await fetchListingPreview(listingUrl, config);
    applyFormFromPreview(preview, { overwrite });

    const filledFields = [
      preview.title,
      preview.address,
      preview.price,
      preview.imageUrl,
    ].filter(Boolean).length;

    if (filledFields > 0) {
      showToast(
        preview.source === '28hse' || preview.source === 'spacious'
          ? 'Listing details loaded'
          : 'Preview loaded from link'
      );
    } else if (showErrors) {
      document.getElementById('image-preview-wrap').hidden = true;
      showToast('Could not extract listing details — fill in manually', 'error');
    }
  } catch (err) {
    if (showErrors) {
      showToast(`Could not fetch preview: ${err.message}`, 'error');
    }
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Fetch preview';
  }
}

function setupApartmentForm() {
  document.getElementById('form-cancel').addEventListener('click', () => {
    resetForm();
    switchSection('apartments');
  });

  document.getElementById('apartment-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    let imageUrl = document.getElementById('apt-image-url').value.trim();
    const listingUrl = document.getElementById('apt-listing-url').value.trim();

    if (!imageUrl && listingUrl) {
      try {
        const preview = await fetchListingPreview(listingUrl, config);
        imageUrl = preview.imageUrl || '';
      } catch {
        /* manual fallback */
      }
    }

    const apt = {
      id: editingId || generateId(),
      title: document.getElementById('apt-title').value.trim(),
      address: document.getElementById('apt-address').value.trim(),
      price: Number(document.getElementById('apt-price').value),
      currency: document.getElementById('apt-currency').value.trim() || DEFAULT_CURRENCY,
      rooms: Number(document.getElementById('apt-rooms').value) || 1,
      kitchen: document.getElementById('apt-kitchen').value,
      bathroom: document.getElementById('apt-bathroom').value,
      furnished: document.getElementById('apt-furnished').value === 'true',
      availableFrom: document.getElementById('apt-available').value || '',
      listingUrl,
      imageUrl,
      landlordContact: document.getElementById('apt-contact').value.trim(),
      contactType: document.getElementById('apt-contact-type').value,
      description: document.getElementById('apt-description').value.trim(),
      tags: document.getElementById('apt-tags').value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      active: document.getElementById('apt-active').checked,
      createdAt: editingId
        ? apartments.find((a) => a.id === editingId)?.createdAt
        : new Date().toISOString(),
    };

    if (editingId) {
      apartments = apartments.map((a) => (a.id === editingId ? apt : a));
    } else {
      apartments.push(apt);
    }

    saveApartments(apartments);

    const shouldAnnounce = document.getElementById('apt-announce').checked;
    if (shouldAnnounce) {
      const result = await sendCommunityAnnouncement(apt, config);
      if (result.ok) {
        showToast(
          result.warning
            ? `${result.message}`
            : `Apartment saved! ${result.message}`,
          result.warning ? 'error' : 'success'
        );
        if (result.warning) {
          setTimeout(() => showToast(DEPLOY_SHARE_HINT, 'error'), 4000);
        }
      } else {
        showToast(`Saved, but copy failed: ${result.error}`, 'error');
      }
    } else {
      showToast('Apartment saved!');
    }

    resetForm();
    renderApartmentsTable();
    switchSection('apartments');
  });
}

function resetForm() {
  editingId = null;
  document.getElementById('form-title').textContent = 'Add apartment';
  document.getElementById('apartment-form').reset();
  document.getElementById('apt-currency').value = DEFAULT_CURRENCY;
  document.getElementById('apt-rooms').value = 1;
  document.getElementById('apt-active').checked = true;
  document.getElementById('apt-announce').checked = true;
  document.getElementById('image-preview-wrap').hidden = true;
  document.getElementById('image-preview').removeAttribute('src');
}

async function renderStats() {
  const totals = await getTotalStats(config);
  const activeCount = apartments.filter((a) => a.active !== false).length;

  document.getElementById('admin-stat-views').textContent = totals.totalViews;
  document.getElementById('admin-stat-clicks').textContent = totals.totalClicks;
  document.getElementById('admin-stat-messages').textContent = totals.totalMessages;
  document.getElementById('dash-active-listings').textContent = activeCount;

  const clickRate =
    totals.totalViews > 0 ? `${Math.round((totals.totalClicks / totals.totalViews) * 100)}%` : '—';
  const messageRate =
    totals.totalViews > 0 ? `${Math.round((totals.totalMessages / totals.totalViews) * 100)}%` : '—';
  document.getElementById('dash-click-rate').textContent = clickRate;
  document.getElementById('dash-message-rate').textContent = messageRate;

  const sourceEl = document.getElementById('stats-source');
  if (sourceEl) {
    sourceEl.textContent =
      totals.source === 'supabase'
        ? 'Stats from all visitors (Supabase).'
        : 'Stats from this browser only — add Supabase in Settings to track everyone.';
  }

  const rows = apartments.map((apt) => {
    const views = totals.perApartment.views?.[apt.id] || 0;
    const clicks = totals.perApartment.clicks?.[apt.id] || 0;
    const messages = totals.perApartment.messages?.[apt.id] || 0;
    const aptClickRate = views > 0 ? `${Math.round((clicks / views) * 100)}%` : '—';
    const aptMessageRate = views > 0 ? `${Math.round((messages / views) * 100)}%` : '—';

    return {
      apt,
      views,
      clicks,
      messages,
      aptClickRate,
      aptMessageRate,
      score: views + clicks * 2 + messages * 3,
    };
  });

  const sortedByViews = [...rows].sort((a, b) => b.views - a.views);
  const sortedByScore = [...rows].sort((a, b) => b.score - a.score);
  const maxViews = Math.max(1, ...rows.map((r) => r.views));

  const barsEl = document.getElementById('dash-bars-views');
  if (barsEl) {
    barsEl.innerHTML =
      sortedByViews
        .filter((r) => r.views > 0)
        .slice(0, 8)
        .map(
          (r) => `
        <div class="dash-bar-row">
          <span class="dash-bar-label" title="${escapeHtml(r.apt.title)}">${escapeHtml(r.apt.title)}</span>
          <div class="dash-bar-track">
            <div class="dash-bar-fill" style="width: ${Math.round((r.views / maxViews) * 100)}%"></div>
          </div>
          <span class="dash-bar-value">${r.views}</span>
        </div>
      `
        )
        .join('') ||
      '<p class="form-hint">No views yet — share your flats to start tracking.</p>';
  }

  const topEl = document.getElementById('dash-top-list');
  if (topEl) {
    topEl.innerHTML =
      sortedByScore
        .filter((r) => r.score > 0)
        .slice(0, 5)
        .map(
          (r) => `
        <li>
          <span>${escapeHtml(r.apt.title)}</span>
          <span class="dash-top-meta">${r.views} views · ${r.clicks} clicks · ${r.messages} msgs</span>
        </li>
      `
        )
        .join('') || '<li class="form-hint" style="list-style:none">No engagement yet</li>';
  }

  const tbody = document.getElementById('stats-tbody');
  tbody.innerHTML =
    sortedByViews
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.apt.title)}</td>
          <td>${r.apt.active !== false ? '✅ Active' : '⏸ Hidden'}</td>
          <td>${r.views}</td>
          <td>${r.clicks}</td>
          <td>${r.messages}</td>
          <td>${r.aptClickRate}</td>
          <td>${r.aptMessageRate}</td>
        </tr>
      `
      )
      .join('') ||
    '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No apartments yet</td></tr>';

  document.getElementById('reset-stats').onclick = () => {
    if (!confirm('Reset local browser stats? Cloud stats in Supabase are kept.')) return;
    resetStats();
    renderStats();
    showToast('Local stats reset');
  };

  document.getElementById('refresh-stats').onclick = () => {
    renderStats();
    showToast('Dashboard refreshed');
  };
}

function populateSettingsForm() {
  document.getElementById('cfg-site-url').value = config.siteUrl || '';
  document.getElementById('cfg-site-name').value = config.siteName || '';
  document.getElementById('cfg-tagline').value = config.tagline || '';
  document.getElementById('cfg-group-name').value = config.groupName || '';
  document.getElementById('cfg-message-template').value = config.contactMessageTemplate || '';
  document.getElementById('cfg-whatsapp-template').value = config.whatsappAnnouncementTemplate || '';
  document.getElementById('cfg-announcement-template').value = config.announcementTemplate || '';
  document.getElementById('cfg-telegram').value = config.telegramWebhookUrl || '';
  document.getElementById('cfg-admin-password').value = config.adminPassword || '';
  document.getElementById('cfg-supabase-url').value = config.supabaseUrl || '';
  document.getElementById('cfg-supabase-key').value = config.supabaseAnonKey || '';
}

function setupSettingsForm() {
  document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();

    config = {
      ...config,
      siteUrl: document.getElementById('cfg-site-url').value.trim().replace(/\/$/, ''),
      siteName: document.getElementById('cfg-site-name').value.trim(),
      tagline: document.getElementById('cfg-tagline').value.trim(),
      groupName: document.getElementById('cfg-group-name').value.trim(),
      contactMessageTemplate: document.getElementById('cfg-message-template').value,
      whatsappAnnouncementTemplate: document.getElementById('cfg-whatsapp-template').value,
      announcementTemplate: document.getElementById('cfg-announcement-template').value,
      telegramWebhookUrl: document.getElementById('cfg-telegram').value.trim(),
      adminPassword: document.getElementById('cfg-admin-password').value.trim(),
      supabaseUrl: document.getElementById('cfg-supabase-url').value.trim(),
      supabaseAnonKey: document.getElementById('cfg-supabase-key').value.trim(),
    };

    saveConfig(config);
    showToast('Settings saved!');
  });
}

function setupExport() {
  document.getElementById('export-apartments').addEventListener('click', async () => {
    try {
      await copyJsonToClipboard(apartments);
      showToast('apartments.json copied — paste into public/data/apartments.json on GitHub');
      setTimeout(() => showToast(DEPLOY_SHARE_HINT, 'success'), 3500);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  });

  document.getElementById('export-config').addEventListener('click', async () => {
    try {
      await copyJsonToClipboard(config);
      showToast('config.json copied to clipboard');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  });

  document.getElementById('export-stats').addEventListener('click', async () => {
    try {
      const stats = await getTotalStats(config);
      await copyJsonToClipboard(stats.perApartment);
      showToast('stats.json copied to clipboard');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Expected an array');
      apartments = data;
      saveApartments(apartments);
      renderApartmentsTable();
      showToast(`Imported ${data.length} apartments`);
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error');
    }

    e.target.value = '';
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

init();
