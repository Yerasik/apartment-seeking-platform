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
import { uploadListingMedia, uploadManyMedia, apartmentMedia, coverImageUrl } from './lib/mediaUpload.js';

const DEFAULT_CURRENCY = 'HKD';

let config = {};
let apartments = [];
let editingId = null;
let draftMedia = [];
let statsAgentFilter = '';

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
  setupMediaUpload();
  setupListingPreview();
  setupSettingsForm();
  setupExport();
  setupAgentFilter();
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
  refreshAgentSuggestions();
  const tbody = document.getElementById('apartments-tbody');
  const rows = await Promise.all(
    apartments.map(async (apt) => {
      const stats = await getApartmentStats(apt.id, config);
      return `
        <tr>
          <td>${escapeHtml(apt.title)}</td>
          <td>${escapeHtml(apt.agentName || '—')}</td>
          <td>${apt.price} ${apt.currency}</td>
          <td>${apt.featured ? '⭐' : '—'}</td>
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
  document.getElementById('apt-agent').value = apt.agentName || '';
  document.getElementById('apt-image-url').value = apt.imageUrl || '';
  document.getElementById('apt-contact').value = apt.landlordContact || '';
  document.getElementById('apt-contact-type').value = apt.contactType || 'email';
  document.getElementById('apt-description').value = apt.description || '';
  document.getElementById('apt-tags').value = (apt.tags || []).join(', ');
  document.getElementById('apt-featured').checked = Boolean(apt.featured);
  document.getElementById('apt-active').checked = apt.active !== false;
  document.getElementById('apt-announce').checked = false;

  draftMedia = apartmentMedia(apt);
  renderMediaThumbs();

  const cover = coverImageUrl(apt) || apt.imageUrl;
  if (cover && !cover.startsWith('data:')) {
    document.getElementById('image-preview').src = cover;
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
  document.addEventListener('paste', async (e) => {
    const addSection = document.getElementById('section-add');
    if (!addSection?.classList.contains('active')) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;

      const file = item.getAsFile();
      if (!file) continue;

      e.preventDefault();
      const status = document.getElementById('media-upload-status');
      status.textContent = 'Uploading pasted photo…';
      try {
        const aptId = editingId || `draft-${Date.now().toString(36)}`;
        const uploaded = await uploadListingMedia(file, config, { apartmentId: aptId });
        draftMedia.push(uploaded);
        renderMediaThumbs();
        syncCoverField();
        status.textContent = 'Photo uploaded to cloud';
        showToast('Photo uploaded — visible to everyone after you copy apartments.json to GitHub');
      } catch (err) {
        status.textContent = '';
        showToast(err.message, 'error');
      }
      return;
    }
  });
}

function setupMediaUpload() {
  const input = document.getElementById('apt-media-files');
  const status = document.getElementById('media-upload-status');

  input.addEventListener('change', async () => {
    const files = input.files;
    if (!files?.length) return;

    status.textContent = 'Uploading…';
    try {
      const aptId = editingId || `draft-${Date.now().toString(36)}`;
      const uploaded = await uploadManyMedia(files, config, {
        apartmentId: aptId,
        onProgress: (msg) => {
          status.textContent = msg;
        },
      });
      draftMedia = [...draftMedia, ...uploaded];
      renderMediaThumbs();
      syncCoverField();
      status.textContent = `Uploaded ${uploaded.length} file(s)`;
      showToast('Media uploaded to cloud');
    } catch (err) {
      status.textContent = '';
      showToast(err.message, 'error');
    }
    input.value = '';
  });
}

function renderMediaThumbs() {
  const wrap = document.getElementById('media-thumbs');
  if (!draftMedia.length) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = draftMedia
    .map(
      (item, i) => `
      <div class="photo-thumb" data-index="${i}">
        ${
          item.type === 'video'
            ? `<video src="${item.url}" muted preload="metadata"></video>`
            : `<img src="${item.url}" alt="Media ${i + 1}" />`
        }
        <button type="button" class="photo-thumb-remove" data-index="${i}" title="Remove">✕</button>
        ${i === 0 ? '<span class="photo-thumb-badge">Cover</span>' : ''}
        ${item.type === 'video' ? '<span class="photo-thumb-badge video-badge">Video</span>' : ''}
      </div>`
    )
    .join('');

  wrap.querySelectorAll('.photo-thumb-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      draftMedia.splice(Number(btn.dataset.index), 1);
      renderMediaThumbs();
      syncCoverField();
    });
  });
}

function syncCoverField() {
  const cover = draftMedia.find((m) => m.type === 'image')?.url || draftMedia[0]?.url || '';
  const field = document.getElementById('apt-image-url');
  if (cover) {
    field.value = cover;
    document.getElementById('image-preview').src = cover;
    document.getElementById('image-preview-wrap').hidden = false;
  }
}

function refreshAgentSuggestions() {
  const list = document.getElementById('agent-suggestions');
  if (!list) return;
  const names = [...new Set(apartments.map((a) => (a.agentName || '').trim()).filter(Boolean))].sort();
  list.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
}

function setupAgentFilter() {
  const select = document.getElementById('stats-agent-filter');
  if (!select) return;
  select.addEventListener('change', () => {
    statsAgentFilter = select.value;
    renderStats();
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
    if (!draftMedia.some((m) => m.url === preview.imageUrl)) {
      draftMedia = [{ type: 'image', url: preview.imageUrl }, ...draftMedia];
      renderMediaThumbs();
    }
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
    let media = [...draftMedia];

    if (!media.length && !imageUrl && listingUrl) {
      try {
        const preview = await fetchListingPreview(listingUrl, config);
        imageUrl = preview.imageUrl || '';
        if (imageUrl) media = [{ type: 'image', url: imageUrl }];
      } catch {
        /* manual fallback */
      }
    }

    if (!media.length && imageUrl && !imageUrl.startsWith('data:')) {
      media = [{ type: 'image', url: imageUrl }];
    }

    if ((!imageUrl || imageUrl.startsWith('data:')) && media.length) {
      imageUrl = media.find((m) => m.type === 'image')?.url || media[0].url;
    }

    const videoUrl = media.find((m) => m.type === 'video')?.url || '';

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
      agentName: document.getElementById('apt-agent').value.trim(),
      listingUrl,
      imageUrl,
      videoUrl,
      media,
      landlordContact: document.getElementById('apt-contact').value.trim(),
      contactType: document.getElementById('apt-contact-type').value,
      description: document.getElementById('apt-description').value.trim(),
      tags: document.getElementById('apt-tags').value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      featured: document.getElementById('apt-featured').checked,
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
  document.getElementById('apt-featured').checked = false;
  document.getElementById('apt-active').checked = true;
  document.getElementById('apt-announce').checked = true;
  document.getElementById('image-preview-wrap').hidden = true;
  document.getElementById('image-preview').removeAttribute('src');
  draftMedia = [];
  renderMediaThumbs();
  document.getElementById('media-upload-status').textContent = '';
}

function agentKey(apt) {
  return (apt.agentName || '').trim() || 'Other / unassigned';
}

async function renderStats() {
  const totals = await getTotalStats(config);
  refreshAgentFilterOptions();

  const filteredApts = statsAgentFilter
    ? apartments.filter((a) => agentKey(a) === statsAgentFilter)
    : apartments;

  const sumFor = (bucket) =>
    filteredApts.reduce((n, apt) => n + (totals.perApartment[bucket]?.[apt.id] || 0), 0);

  const totalViews = sumFor('views');
  const totalClicks = sumFor('clicks');
  const totalMessages = sumFor('messages');
  const activeCount = filteredApts.filter((a) => a.active !== false).length;

  document.getElementById('admin-stat-views').textContent = totalViews;
  document.getElementById('admin-stat-clicks').textContent = totalClicks;
  document.getElementById('admin-stat-messages').textContent = totalMessages;
  document.getElementById('dash-active-listings').textContent = activeCount;

  const clickRate = totalViews > 0 ? `${Math.round((totalClicks / totalViews) * 100)}%` : '—';
  const messageRate = totalViews > 0 ? `${Math.round((totalMessages / totalViews) * 100)}%` : '—';
  document.getElementById('dash-click-rate').textContent = clickRate;
  document.getElementById('dash-message-rate').textContent = messageRate;

  const sourceEl = document.getElementById('stats-source');
  if (sourceEl) {
    const base =
      totals.source === 'supabase'
        ? 'Stats from all visitors (Supabase).'
        : 'Stats from this browser only — add Supabase in Settings to track everyone.';
    sourceEl.textContent = statsAgentFilter ? `${base} Filtered by agent: ${statsAgentFilter}` : base;
  }

  renderAgentSummary(totals);

  const rows = filteredApts.map((apt) => {
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
          <td>${escapeHtml(r.apt.title)}${r.apt.agentName ? ` <span class="form-hint">(${escapeHtml(r.apt.agentName)})</span>` : ''}</td>
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

function refreshAgentFilterOptions() {
  const select = document.getElementById('stats-agent-filter');
  if (!select) return;
  const current = statsAgentFilter;
  const names = [...new Set(apartments.map(agentKey))].sort((a, b) => {
    if (a === 'Other / unassigned') return 1;
    if (b === 'Other / unassigned') return -1;
    return a.localeCompare(b);
  });
  select.innerHTML =
    `<option value="">All agents</option>` +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  select.value = names.includes(current) ? current : '';
  statsAgentFilter = select.value;
}

function renderAgentSummary(totals) {
  const tbody = document.getElementById('agent-stats-tbody');
  if (!tbody) return;

  const byAgent = new Map();
  for (const apt of apartments) {
    const key = agentKey(apt);
    if (!byAgent.has(key)) {
      byAgent.set(key, { listings: 0, views: 0, clicks: 0, messages: 0 });
    }
    const row = byAgent.get(key);
    row.listings += 1;
    row.views += totals.perApartment.views?.[apt.id] || 0;
    row.clicks += totals.perApartment.clicks?.[apt.id] || 0;
    row.messages += totals.perApartment.messages?.[apt.id] || 0;
  }

  const sorted = [...byAgent.entries()].sort((a, b) => b[1].views - a[1].views);
  tbody.innerHTML =
    sorted
      .map(
        ([name, s]) => `
      <tr>
        <td><button type="button" class="btn btn-secondary btn-sm filter-agent" data-agent="${escapeHtml(name)}">${escapeHtml(name)}</button></td>
        <td>${s.listings}</td>
        <td>${s.views}</td>
        <td>${s.clicks}</td>
        <td>${s.messages}</td>
      </tr>`
      )
      .join('') ||
    '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No data yet</td></tr>';

  tbody.querySelectorAll('.filter-agent').forEach((btn) => {
    btn.addEventListener('click', () => {
      statsAgentFilter = btn.dataset.agent;
      const select = document.getElementById('stats-agent-filter');
      if (select) select.value = statsAgentFilter;
      renderStats();
    });
  });
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
      siteUrl: document
        .getElementById('cfg-site-url')
        .value.trim()
        .replace(/\/$/, '')
        .replace(
          /^(https?:\/\/[^/]+\/apartment-seeking-platform)(?:\/apartment-seeking-platform)+/i,
          '$1'
        ),
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
    showToast('Settings saved — Copy config.json to GitHub so other devices get the same API keys');
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
      showToast('config.json copied (includes API keys for GitHub)');
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
