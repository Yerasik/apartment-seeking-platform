const STORAGE_KEYS = {
  stats: 'rt_stats',
  apartments: 'rt_apartments',
  config: 'rt_config',
};

export async function loadConfig() {
  // Prefer committed GitHub config so keys work on every device.
  try {
    const res = await fetch(`./data/config.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const fileConfig = await res.json();
      const stored = localStorage.getItem(STORAGE_KEYS.config);
      if (stored) {
        try {
          // Merge local overrides on top of file, but never drop file API keys.
          const local = JSON.parse(stored);
          return {
            ...fileConfig,
            ...local,
            supabaseUrl: fileConfig.supabaseUrl || local.supabaseUrl || '',
            supabaseAnonKey: fileConfig.supabaseAnonKey || local.supabaseAnonKey || '',
          };
        } catch {
          return fileConfig;
        }
      }
      return fileConfig;
    }
  } catch {
    /* fall through */
  }

  const stored = localStorage.getItem(STORAGE_KEYS.config);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      /* fall through */
    }
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
    siteUrl: 'https://yerasik.github.io/apartment-seeking-platform',
    whatsappAnnouncementTemplate:
      '🏠 *New flat available!*\n\n*{title}*\n📍 {address}\n💰 {price} {currency}/month\n🛏 {rooms} room(s) · 🍳 Kitchen: {kitchenLabel}\n📅 Available from: {availableFrom}\n\n{description}\n\n🔗 {shareUrl}',
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

export async function copyJsonToClipboard(data) {
  const text = JSON.stringify(data, null, 2);
  await navigator.clipboard.writeText(text);
  return text;
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
