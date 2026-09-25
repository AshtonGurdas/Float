# Float

Cash books and a market watchlist for a TCG shop.

Books record what you spent and what you made: a named card, a booster box, a case of boxes, a fee, or anything else. Stock shows what is still on hand. Market is a watchlist of TCGplayer products with the daily market price.

Prices come from [TCGCSV](https://tcgcsv.com/), a public daily copy of TCGplayer's catalog and market prices. They are not a live tick. A scheduled job saves a new point for everything on a watchlist after TCGCSV's daily update.

Your entries and watchlist are stored in Supabase under your account. The catalog cache lives in the same project and is only written by the server.

## Scripts

```bash
npm install
npm test
npm run dev
```

Dev server: http://127.0.0.1:5178/

## Environment

Copy `.env.example` to `.env`.

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public client keys.
- `SUPABASE_SERVICE_ROLE_KEY` stays on the server. It writes the price cache.
- `CRON_SECRET` lets the daily Vercel cron refresh watchlist prices.

Schema: `supabase/migrations/001_init.sql`.
