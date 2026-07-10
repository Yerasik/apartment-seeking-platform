const STORAGE_KEYS = {
  stats: 'rt_stats',
  apartments: 'rt_apartments',
  config: 'rt_config',
};

export async function loadConfig() {
  const stored = localStorage.getItem(STORAGE_KEYS.config);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      /* fall through */
    }
  }

  try {
    const res = await fetch('./data/config.json');
    if (res.ok) return await res.json();
  } catch {
    /* offline or missing */
  }

  return getDefaultConfig();
}

export async function loadApartments() {
  const stored = localStorage.getItem(STORAGE_KEYS.apartments);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      /* fall through */
    }
  }

  try {
    const res = await fetch('./data/apartments.json');
    if (res.ok) return await res.json();
  } catch {
    /* offline */
  }

  return [];
}

export async function loadStats() {
  const stored = localStorage.getItem(STORAGE_KEYS.stats);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      /* fall through */
    }
  }

  try {
    const res = await fetch('./data/stats.json');
    if (res.ok) return await res.json();
  } catch {
    /* offline */
  }

  return { clicks: {}, messages: {}, views: {}, lastUpdated: null };
}

export function saveApartments(apartments) {
  localStorage.setItem(STORAGE_KEYS.apartments, JSON.stringify(apartments));
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
}

export function saveStats(stats) {
  stats.lastUpdated = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
}

export function getDefaultConfig() {
  return {
    siteName: 'Renting Together',
    tagline: 'Find flats & flatmates together',
    groupName: 'Renting Together',
    contactMessageTemplate:
      "Hello! I'm from the {groupName} community group. I'm interested in renting this apartment and would like to ask about the possibility of viewing it and discussing the terms. Could you please share more details? Thank you!",
    adminPassword: 'renting-together',
    telegramWebhookUrl: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    announcementTemplate:
      '🏠 *New flat available!*\n\n*{title}*\n📍 {address}\n💰 {price} {currency}/month\n🛏 {rooms} room(s) · 🍳 Kitchen: {kitchen}\n📅 Available from: {availableFrom}\n\n{description}\n\n🔗 [View listing]({listingUrl})',
  };
}

export function generateId() {
  return `apt-${Date.now().toString(36)}`;
}

export function formatTemplate(template, data) {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] ?? '');
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}
