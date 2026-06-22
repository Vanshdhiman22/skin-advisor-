# Skin & Scalp Advisor

An AI assistant for skincare & haircare e-commerce stores. A shopper picks **Face & Skin**
or **Scalp & Hair**, the camera does a quick AI scan, and they get a routine matched to
what they actually need — 24/7, even when no one's there to reply. This is your demo
build: show it to store owners to win clients, then wire it into a real store.

## What's inside

```
skin-advisor/
├── server.js            # backend: serves the page, runs the scan + chat (Groq)
├── data/
│   └── products.js      # sample catalog (face + hair) — swap for a real store's products
├── public/
│   ├── index.html       # the demo storefront (home / scan / result / chat)
│   ├── styles.css       # styling (restyle per client brand here)
│   └── app.js           # camera + scan + chat logic
├── package.json
└── .env.example
```

## Run it (about 2 minutes)

You need **Node.js 18 or newer** ([nodejs.org](https://nodejs.org)).

```bash
cd skin-advisor
npm install
npm start
```

Open **http://localhost:3000**. (The camera only works on `localhost` or an `https://`
site — that's a browser rule, not the app.)

It runs right away **without a key**: the scan falls back to a quick guided flow, so the
demo never breaks while you're showing it to someone.

### Turn on the real AI scan

1. Get a free key at [console.groq.com](https://console.groq.com).
2. Set it and start. On **Windows PowerShell**:

   ```powershell
   $env:GROQ_API_KEY="gsk_your_real_key_here"
   npm start
   ```

   On **Mac/Linux**:

   ```bash
   GROQ_API_KEY=gsk_your_real_key_here npm start
   ```

With a key set, the photo is sent to a Groq vision model that reads the skin/scalp and
recommends products.

## Heads-up about models (important)

Groq changes its model lineup often. As of mid-2026 several models (including the older
default chat and vision models) were being **deprecated**. If you ever get a *"model not
found / deprecated"* error:

1. Open [console.groq.com/docs/models](https://console.groq.com/docs/models).
2. Copy a current **text** model id and a current **vision** model id.
3. Set them via `TEXT_MODEL` and `VISION_MODEL` (see `.env.example`).

The app keeps working through all this — if the vision model fails, the scan simply uses
the guided flow instead of crashing.

## Make it yours

- **Products:** edit `data/products.js`. Each item has a `category` (`face` or `hair`),
  the types it suits, and the concerns it helps.
- **Branding:** colors are variables at the top of `public/styles.css`; change the store
  name in `public/index.html`.
- **The assistant's tone & rules:** edit the prompt text in `server.js`.

## A note on claims

The scan is a **cosmetic guide** for matching products — not a medical diagnosis. The UI
says this, and the AI is told to avoid medical language. Keep that framing when you pitch
it; it's what keeps you and the store trustworthy.

## Next step: connect a real store

Replace `data/products.js` with a client's real products (from the Shopify API) and embed
`app.js` on their store. That's the build to do once a client says yes.
