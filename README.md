# SudsFlow — Laundry Shop Manager

A single-file, offline-first web app for running a laundry shop counter: take orders,
move them through the wash pipeline, print claim tags, notify customers, and see the
money at the end of the week.

**Live:** https://laundry-shop-one.vercel.app

## Features

- **Dashboard** — today's revenue, order counts, and a machine-load strip showing
  how many kg are sitting at each pipeline stage.
- **POS order intake** — customer picker, multi-service order lines with +/− steppers
  and 3/5/8 kg presets, add-on chips (fabric softener, bleach, press, etc.), discount
  field, and payment as Cash / GCash / Card or pay-on-pickup.
- **Status pipeline** — Received → Washing → Drying → Folding → Ready → Claimed, with
  one-tap advance and status-colored card edges.
- **Receipts** — thermal-tag layout with an oversized claim ID; print or copy as text.
- **Customer notify** — prefilled SMS message and tap-to-call from any order.
- **Customers** — profiles with full order history and lifetime spend.
- **Reports** — 7/30-day revenue, daily bars, top services, and an unpaid-orders list.
- **Price list** — editable ₱ per-kg and per-piece services, seeded with prices typical
  of a Philippine neighborhood laundry shop.
- **Export / Import** — full JSON backup and restore.

## Running it

Open `index.html` directly in a browser — no build step, no dependencies, works offline.

Or serve it locally:

```bash
python3 -m http.server 4770 --directory ~/laundry-shop
```

Then visit http://localhost:4770

## Data storage

All data lives in your browser's `localStorage` on the device you use it on. Nothing is
sent to a server. There is no sync between devices or browsers — use **Export** to save a
JSON backup and **Import** to restore it elsewhere. Clearing site data wipes the app.

## Transparency

The app ships with **seeded example data** so it doesn't open empty: the sample
customers, orders, and order history are invented for demonstration and are not real
people or real transactions. The default price list uses figures that are plausible for a
Philippine laundry shop, but they are illustrative starting points — not surveyed market
rates. Edit the price list to match your actual shop before using it for real orders, and
delete the sample customers and orders when you start entering live data.

Revenue and report figures are computed only from whatever orders exist in your local
data, including seeded ones, until you remove them.
