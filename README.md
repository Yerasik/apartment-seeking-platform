# Renting Together — Flat Listings Platform

A GitHub Pages-hosted website for advertising flats, tracking clicks and landlord inquiries, and posting announcements to your community group (Telegram).

## Features

- **Public listings page** — browse available flats with price, rooms, kitchen type, and more
- **Click tracking** — counts views, listing link clicks, and landlord messages per flat
- **Landlord message templates** — pre-filled message mentioning your *Renting Together* group
- **Admin panel** — add, edit, and hide apartments; view stats; customize everything
- **Telegram announcements** — auto-post new flats to your community group
- **Auto images from listing links** — pulls preview images from the original posting (like WhatsApp link previews); manual URL as fallback

## Quick start (local)

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) for listings and [http://localhost:5173/admin.html](http://localhost:5173/admin.html) for the admin panel.

**Default admin password:** `renting-together` (change it in Admin → Settings)

## Deploy to GitHub Pages

1. Create a GitHub repository (e.g. `apartment-seeking-platform`)
2. Push this project to the `main` branch
3. Go to **Settings → Pages → Build and deployment**
4. Set source to **GitHub Actions**
5. The workflow in `.github/workflows/deploy.yml` will build and deploy automatically

Your site will be live at: `https://<username>.github.io/apartment-seeking-platform/`

> If your repo has a different name, update the `base` path in `vite.config.js`.

## How to use

### Add a flat

1. Go to **Admin** → **Add apartment**
2. Paste the **listing URL** — the image is fetched automatically from the page (like WhatsApp link previews)
3. Fill in price, rooms, kitchen, contact, etc. Only add a manual image URL if there is no link or auto-fetch fails
4. Check **Post announcement to WhatsApp group** to send the announcement
5. Click **Save apartment**
6. Go to **Export / Import** → **Export apartments.json** and commit it to keep data permanent

### Contact a landlord

On the public page, click **Email/WhatsApp landlord**. A pre-written message is shown:

> Hello! I'm from the Renting Together community group. I'm interested in renting this apartment...

The message is tracked when sent. Stats appear on each card and in Admin → Statistics.

### Customize messages

In **Admin → Settings**, edit:

- **Community group name** — used in landlord messages
- **Contact message template** — variables: `{groupName}`, `{title}`, `{address}`, `{price}`, `{currency}`
- **Announcement template** — for Telegram posts

## Telegram setup (community announcements)

The bot token must not live in the browser. Use the included Cloudflare Worker:

1. Create a bot with [@BotFather](https://t.me/BotFather) on Telegram
2. Add the bot to your announcement group and allow it to post
3. Get your group chat ID (send a message in the group, then visit
  `https://api.telegram.org/bot<TOKEN>/getUpdates`)
4. Install Wrangler and deploy:

```bash
npm install -g wrangler
wrangler login
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
npx wrangler deploy
```

1. Copy the worker URL (e.g. `https://renting-together-bot.<account>.workers.dev`)
2. Paste it in **Admin → Settings → Telegram webhook URL**

New flats with "Post announcement" checked will be sent automatically. You can also click the 📢 button on any apartment in the admin list.

## Data persistence


| Data       | Where it lives                                                  |
| ---------- | --------------------------------------------------------------- |
| Apartments | Browser localStorage + `public/data/apartments.json` (defaults) |
| Stats      | Browser localStorage (per browser)                              |
| Settings   | Browser localStorage + `public/data/config.json` (defaults)     |


For shared stats across all visitors, optionally connect **Supabase** in Admin → Settings (create an `events` table with columns: `event_type`, `apartment_id`, `metadata`, `created_at`).

To make apartment changes permanent on GitHub Pages:

1. Add/edit flats in admin
2. Export `apartments.json` and `config.json`
3. Replace files in `public/data/` in your repo
4. Push to `main` — GitHub Actions redeploys

## Project structure

```
├── index.html          # Public listings page
├── admin.html          # Admin panel
├── public/data/        # Default JSON config (editable)
├── src/
│   ├── main.js         # Public page logic
│   ├── admin.js        # Admin panel logic
│   ├── lib/            # Storage, tracking, messaging
│   └── styles/         # CSS
├── scripts/
│   └── telegram-worker.js  # Cloudflare Worker for Telegram
└── .github/workflows/
    └── deploy.yml      # GitHub Pages deployment
```

## License

MIT — use freely for your community.