import { loadStats, saveStats } from './storage.js';

async function syncToSupabase(config, eventType, apartmentId, extra = {}) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return;

  try {
    await fetch(`${config.supabaseUrl}/rest/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_type: eventType,
        apartment_id: apartmentId,
        metadata: extra,
        created_at: new Date().toISOString(),
      }),
    });
  } catch {
    /* supabase optional */
  }
}

function increment(stats, bucket, apartmentId) {
  if (!stats[bucket]) stats[bucket] = {};
  stats[bucket][apartmentId] = (stats[bucket][apartmentId] || 0) + 1;
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

export async function getApartmentStats(apartmentId) {
  const stats = await loadStats();
  return {
    clicks: stats.clicks?.[apartmentId] || 0,
    messages: stats.messages?.[apartmentId] || 0,
    views: stats.views?.[apartmentId] || 0,
  };
}

export async function getTotalStats() {
  const stats = await loadStats();
  const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

  return {
    totalClicks: sum(stats.clicks),
    totalMessages: sum(stats.messages),
    totalViews: sum(stats.views),
    perApartment: stats,
    lastUpdated: stats.lastUpdated,
  };
}

export function resetStats() {
  saveStats({ clicks: {}, messages: {}, views: {}, lastUpdated: null });
}
