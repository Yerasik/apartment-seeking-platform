/**
 * Cloudflare Worker — Telegram announcement proxy
 *
 * Deploy this to Cloudflare Workers (free tier) to post flat announcements
 * to your Telegram community group without exposing your bot token in the browser.
 *
 * Setup:
 * 1. Create a Telegram bot via @BotFather → copy the token
 * 2. Add the bot to your community group and make it admin (or allow posting)
 * 3. Get your group chat ID (use @userinfobot or send a message and call getUpdates)
 * 4. Deploy this worker:
 *    npx wrangler deploy scripts/telegram-worker.js --name renting-together-bot
 * 5. Set secrets:
 *    npx wrangler secret put TELEGRAM_BOT_TOKEN
 *    npx wrangler secret put TELEGRAM_CHAT_ID
 * 6. Paste the worker URL into Admin → Settings → Telegram webhook URL
 */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return json({ error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set' }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const text = body.text;
    if (!text) {
      return json({ error: 'Missing text field' }, 400);
    }

    const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;

    const res = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      return json({ error: data.description || 'Telegram API error' }, 502);
    }

    return json({ ok: true, messageId: data.result?.message_id });
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
