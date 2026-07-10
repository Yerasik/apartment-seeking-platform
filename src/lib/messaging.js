import { formatTemplate } from './storage.js';

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

export function buildWhatsAppAnnouncement(apartment, config) {
  const template =
    config.whatsappAnnouncementTemplate ||
    config.announcementTemplate?.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2') ||
    defaultWhatsAppTemplate();

  return formatTemplate(template, {
    ...announcementData(apartment),
    groupName: config.groupName,
  });
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

function defaultWhatsAppTemplate() {
  return `🏠 *New flat available!*

*{title}*
📍 {address}
💰 {price} {currency}/month
🛏 {rooms} room(s) · 🍳 Kitchen: {kitchen}
📅 Available from: {availableFrom}

{description}

🔗 {listingUrl}`;
}

export async function sendWhatsAppAnnouncement(apartment, config) {
  const text = buildWhatsAppAnnouncement(apartment, config);

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be blocked until user gesture — that's fine */
  }

  const phone = config.whatsappAnnouncePhone?.replace(/\D/g, '');
  const encoded = encodeURIComponent(text);

  let url;
  if (phone) {
    url = `https://wa.me/${phone}?text=${encoded}`;
  } else {
    url = `https://wa.me/?text=${encoded}`;
  }

  window.open(url, '_blank', 'noopener');

  if (config.whatsappGroupLink) {
    setTimeout(() => {
      window.open(config.whatsappGroupLink, '_blank', 'noopener');
    }, 600);
  }

  return {
    ok: true,
    text,
    message: phone
      ? 'WhatsApp opened with your announcement ready to send.'
      : 'WhatsApp opened — select your announcement group and tap Send. Message copied to clipboard.',
  };
}

export async function sendCommunityAnnouncement(apartment, config) {
  return sendWhatsAppAnnouncement(apartment, config);
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
