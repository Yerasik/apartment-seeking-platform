const STORAGE_KEYS = {
  stats: 'rt_stats',
  apartments: 'rt_apartments',
  config: 'rt_config',
};

function sanitizeConfig(config) {
  if (!config || typeof config !== 'object') return config;
  if (config.siteUrl) {
    config.siteUrl = String(config.siteUrl)
      .trim()
      .replace(/\/$/, '')
      .replace(
        /^(https?:\/\/[^/]+\/apartment-seeking-platform)(?:\/apartment-seeking-platform)+/i,
        '$1'
      );
  }
  return config;
}

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
          const merged = {
            ...fileConfig,
            ...local,
            supabaseUrl: fileConfig.supabaseUrl || local.supabaseUrl || '',
            supabaseAnonKey: fileConfig.supabaseAnonKey || local.supabaseAnonKey || '',
            // Prefer the short landlord message from the repo (rooms/kitchen no longer appended).
            contactMessageTemplate:
              fileConfig.contactMessageTemplate || local.contactMessageTemplate || '',
          };
          return sanitizeConfig(merged);
        } catch {
          return sanitizeConfig(fileConfig);
        }
      }
      return sanitizeConfig(fileConfig);
    }
  } catch {
    /* fall through */
  }

  const stored = localStorage.getItem(STORAGE_KEYS.config);
  if (stored) {
    try {
      return sanitizeConfig(JSON.parse(stored));
    } catch {
      /* fall through */
    }
  }

  return sanitizeConfig(getDefaultConfig());
}

export function sortApartmentsNewestFirst(list) {
  return [...(list || [])].sort((a, b) => {
    const ta = Date.parse(a?.createdAt || '') || 0;
    const tb = Date.parse(b?.createdAt || '') || 0;
    if (tb !== ta) return tb - ta;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
}

export async function loadApartments({ fromFile = false } = {}) {
  // Public site always loads the committed JSON so visitors see the latest deploy.
  // Admin keeps using localStorage so edits stay local until you copy to GitHub.
  if (!fromFile) {
    const stored = localStorage.getItem(STORAGE_KEYS.apartments);
    if (stored) {
      try {
        return sortApartmentsNewestFirst(JSON.parse(stored));
      } catch {
        /* fall through */
      }
    }
  }

  try {
    const res = await fetch(`./data/apartments.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) return sortApartmentsNewestFirst(await res.json());
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
  const sorted = sortApartmentsNewestFirst(apartments);
  localStorage.setItem(STORAGE_KEYS.apartments, JSON.stringify(sorted));
  return sorted;
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
      "Hello! I'm from the {groupName} community. I'm interested in this listing:\n{listingUrl}\n\nCould you share more details? Thank you!",
    adminPassword: 'renting-together',
    siteUrl: 'https://yerasik.github.io/apartment-seeking-platform',
    whatsappAnnouncementTemplate:
      '🏠 *New flat available!*\n\n*{title}*\n📍 {address}\n💰 {price} {currency}/month\n🛏 {rooms} room(s) · 🍳 Kitchen: {kitchenLabel}\n📅 Available from: {availableFrom}\n\n{description}\n\n🔗 {shareUrl}',
    telegramWebhookUrl: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    agents: [],
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
