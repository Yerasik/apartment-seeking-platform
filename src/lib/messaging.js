import { formatTemplate } from './storage.js';
import { buildListingShareUrl } from './share.js';

export function buildContactMessage(apartment, config) {
  const template = config.contactMessageTemplate;
  const base = formatTemplate(template, {
    groupName: config.groupName,
    title: apartment.title,
    address: apartment.address,
    price: apartment.price,
    currency: apartment.currency,
  });

  const details = [
    apartment.rooms ? `${apartment.rooms} room(s)` : null,
    apartment.kitchen ? `Kitchen: ${apartment.kitchen}` : null,
    apartment.availableFrom ? `Available from: ${apartment.availableFrom}` : null,
    apartment.listingUrl ? `Listing: ${apartment.listingUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return details ? `${base}\n\n${details}` : base;
}

export function buildAnnouncement(apartment, config) {
  return formatTemplate(config.announcementTemplate, announcementData(apartment));
}

function formatKitchen(kitchen) {
  const labels = {
    separate: 'Separate kitchen',
    kitchenette: 'Kitchenette',
    shared: 'Shared kitchen',
    none: 'No kitchen',
  };
  return labels[kitchen] || kitchen || '';
}

export const DEFAULT_WHATSAPP_TEMPLATE = `🏠 *New flat available!*

*{title}*
📍 {address}
💰 {price} {currency}/month
🛏 {rooms} room(s) · 🍳 Kitchen: {kitchenLabel}
📅 Available from: {availableFrom}

{description}

🔗 {shareUrl}`;

function whatsappAnnouncementData(apartment, config = {}) {
  return {
    ...announcementData(apartment),
    groupName: config.groupName || 'Renting Together',
    kitchenLabel: formatKitchen(apartment.kitchen),
    availableFrom: apartment.availableFrom || 'Flexible',
    shareUrl: buildListingShareUrl(apartment, config),
  };
}

export function buildWhatsAppAnnouncement(apartment, config = {}) {
  const template =
    config.whatsappAnnouncementTemplate ||
    DEFAULT_WHATSAPP_TEMPLATE;

  const text = formatTemplate(template, whatsappAnnouncementData(apartment, config));

  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\*\*\s*\*/g, '')
    .trim();
}

export function hasPreviewImage(apartment) {
  return Boolean(apartment.imageUrl?.startsWith('http') || apartment.listingUrl?.startsWith('http'));
}

export async function sendWhatsAppAnnouncement(apartment, config = {}) {
  const text = buildWhatsAppAnnouncement(apartment, config);

  if (!hasPreviewImage(apartment)) {
    return {
      ok: false,
      error: 'Add a 28Hse or Spacious listing link so the flat photo can appear in WhatsApp.',
    };
  }

  if (apartment.imageUrl?.startsWith('data:')) {
    return {
      ok: false,
      error: 'Pasted photos cannot show in WhatsApp previews. Use a listing link to pull the photo automatically.',
    };
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return { ok: false, error: 'Could not copy to clipboard.' };
  }

  return {
    ok: true,
    text,
    message: 'Message copied — paste in WhatsApp after deploying to GitHub Pages for the photo preview.',
  };
}

export async function sendCommunityAnnouncement(apartment, config) {
  return sendWhatsAppAnnouncement(apartment, config);
}

function announcementData(apartment) {
  return {
    title: apartment.title,
    address: apartment.address,
    price: apartment.price,
    currency: apartment.currency,
    rooms: apartment.rooms,
    kitchen: apartment.kitchen,
    bathroom: apartment.bathroom,
    availableFrom: apartment.availableFrom,
    description: apartment.description,
    listingUrl: apartment.listingUrl,
    groupName: apartment.groupName,
  };
}

export async function sendTelegramAnnouncement(apartment, config) {
  const webhookUrl = config.telegramWebhookUrl;
  if (!webhookUrl) {
    return { ok: false, error: 'Telegram webhook URL not configured. Set it in Admin → Settings.' };
  }

  const text = buildAnnouncement(apartment, config);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, apartment }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Webhook failed (${res.status}): ${body}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function openContactChannel(apartment, message) {
  const encoded = encodeURIComponent(message);

  switch (apartment.contactType) {
    case 'email':
      window.open(`mailto:${apartment.landlordContact}?subject=${encodeURIComponent(`Inquiry: ${apartment.title}`)}&body=${encoded}`, '_blank');
      break;
    case 'phone':
      window.open(`https://wa.me/${apartment.landlordContact.replace(/\D/g, '')}?text=${encoded}`, '_blank');
      break;
    case 'telegram':
      window.open(`https://t.me/${apartment.landlordContact.replace('@', '')}`, '_blank');
      break;
    default:
      if (navigator.clipboard) {
        navigator.clipboard.writeText(message);
      }
      break;
  }
}

export function getContactLabel(contactType) {
  const labels = {
    email: '📧 Email landlord',
    phone: '💬 WhatsApp landlord',
    telegram: '✈️ Telegram landlord',
    other: '📋 Copy message',
  };
  return labels[contactType] || labels.other;
}
