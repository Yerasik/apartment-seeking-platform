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
  return formatTemplate(config.announcementTemplate, {
    title: apartment.title,
    address: apartment.address,
    price: apartment.price,
    currency: apartment.currency,
    rooms: apartment.rooms,
    kitchen: apartment.kitchen,
    availableFrom: apartment.availableFrom,
    description: apartment.description,
    listingUrl: apartment.listingUrl,
  });
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
