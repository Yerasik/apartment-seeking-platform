import { loadStats, saveStats } from './storage.js';

function supabaseHeaders(config) {
  return {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
  };
}

function isSupabaseConfigured(config) {
  return Boolean(config.supabaseUrl?.trim() && config.supabaseAnonKey?.trim());
}

function increment(stats, bucket, apartmentId) {
  if (!stats[bucket]) stats[bucket] = {};
  stats[bucket][apartmentId] = (stats[bucket][apartmentId] || 0) + 1;
}

function aggregateEvents(events) {
  const stats = { clicks: {}, messages: {}, views: {} };

  for (const event of events) {
    switch (event.event_type) {
      case 'click':
        increment(stats, 'clicks', event.apartment_id);
        break;
      case 'message':
        increment(stats, 'messages', event.apartment_id);
        break;
      case 'view':
        increment(stats, 'views', event.apartment_id);
        break;
      default:
        break;
    }
  }

  return stats;
}

async function syncToSupabase(config, eventType, apartmentId, extra = {}) {
  if (!isSupabaseConfigured(config)) return;

  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...supabaseHeaders(config),
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_type: eventType,
        apartment_id: apartmentId,
        metadata: extra,
        created_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      console.warn('Supabase track failed', res.status);
    }
  } catch {
    /* supabase optional */
  }
}

async function fetchStatsFromSupabase(config) {
  if (!isSupabaseConfigured(config)) return null;

  try {
    const res = await fetch(
      `${config.supabaseUrl}/rest/v1/events?select=event_type,apartment_id`,
      {
        headers: supabaseHeaders(config),
      }
    );

    if (!res.ok) return null;

    const events = await res.json();
    if (!Array.isArray(events)) return null;

    return aggregateEvents(events);
  } catch {
    return null;
  }
}

export async function trackEvent(eventType, apartmentId, config = {}) {
  const stats = await loadStats();

  switch (eventType) {
    case 'click':
      increment(stats, 'clicks', apartmentId);
      break;
    case 'message':
      increment(stats, 'messages', apartmentId);
      break;
    case 'view':
      increment(stats, 'views', apartmentId);
      break;
    default:
      break;
  }

  saveStats(stats);
  await syncToSupabase(config, eventType, apartmentId);
  return stats;
}

export async function getApartmentStats(apartmentId, config = {}) {
  const cloud = await fetchStatsFromSupabase(config);

  if (cloud) {
    return {
      clicks: cloud.clicks[apartmentId] || 0,
      messages: cloud.messages[apartmentId] || 0,
      views: cloud.views[apartmentId] || 0,
    };
  }

  const stats = await loadStats();
  return {
    clicks: stats.clicks?.[apartmentId] || 0,
    messages: stats.messages?.[apartmentId] || 0,
    views: stats.views?.[apartmentId] || 0,
  };
}

export async function getTotalStats(config = {}) {
  const cloud = await fetchStatsFromSupabase(config);

  if (cloud) {
    const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

    return {
      totalClicks: sum(cloud.clicks),
      totalMessages: sum(cloud.messages),
      totalViews: sum(cloud.views),
      perApartment: cloud,
      lastUpdated: new Date().toISOString(),
      source: 'supabase',
    };
  }

  const stats = await loadStats();
  const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

  return {
    totalClicks: sum(stats.clicks),
    totalMessages: sum(stats.messages),
    totalViews: sum(stats.views),
    perApartment: stats,
    lastUpdated: stats.lastUpdated,
    source: 'local',
  };
}

export function resetStats() {
  saveStats({ clicks: {}, messages: {}, views: {}, lastUpdated: null });
}
