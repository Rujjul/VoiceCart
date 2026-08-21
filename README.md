# VoiceCart

Voice-first shopping list. Add, update, check off, and remove items by speaking naturally — or type when you prefer.

**Live demo:** [voicecart-production.up.railway.app](https://voicecart-production.up.railway.app)

## Features

- **Voice commands** via the browser Speech Recognition API (Chrome / Edge recommended)
- **Natural phrases** — quantities, units, and filler words are cleaned up automatically  
  e.g. *"Umm, can you add like 4 packets of milk please"* → Milk × 4 packets
- **Text input** with search and Enter-to-add
- **Categories** — produce, dairy, bakery, meat, beverages, pantry, household, and more
- **Quantity & units** — pcs, kg, g, ml, L, packet, bottle, loaf, roll, and similar
- **Suggestions** for common grocery staples
- **Persistent list** stored as JSON on the server

## Tech stack

| Layer | Stack |
| --- | --- |
| Client | React 19, Vite |
| Server | Node.js, Express |
| Storage | `server/data/list.json` |
| Deploy | Docker on Railway |

## Prerequisites

- Node.js 20+
- A Chromium-based browser for voice (mic access requires HTTPS in production)

## Getting started

```bash
# Install root tooling (concurrently) plus app deps
npm install
npm install --prefix client
npm install --prefix server

# Run API + Vite together
npm run dev
```

- App: [http://localhost:5173](http://localhost:5173)  
- API: [http://localhost:3001](http://localhost:3001)  
  Vite proxies `/api` to the server in development.

### Production build (local)

```bash
npm run build
NODE_ENV=production npm start
```

Then open [http://localhost:3001](http://localhost:3001). The Express server serves the built client and the API.

### Docker

```bash
docker build -t voicecart .
docker run -p 3001:3001 -e NODE_ENV=production voicecart
```

## Voice commands

Tap the mic and try:

| Intent | Examples |
| --- | --- |
| Add | *"Add milk"*, *"2 kg rice"*, *"a dozen bananas"* |
| Remove | *"Remove apples"*, *"Delete milk"* |
| Check off | *"Check off bread"*, *"Got eggs"* |
| Update | *"Set milk to 3 packets"*, *"Change rice to 2 kg"* |

Multiple items in one phrase are supported (comma / *and*): *"milk and eggs"*.

## Project structure

```
voice/
├── client/          # React + Vite UI
│   └── src/
│       ├── App.jsx
│       ├── parseCommand.js   # speech / text parsing
│       ├── useSpeech.js
│       └── api.js
├── server/          # Express API
│   ├── index.js
│   ├── suggestions.js
│   └── data/list.json
├── Dockerfile
└── package.json
```

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/items` | List all items |
| `POST` | `/api/items` | Add item (or bump quantity if name exists) |
| `PATCH` | `/api/items/:id` | Update name, quantity, unit, or checked |
| `DELETE` | `/api/items/:id` | Remove item |
| `GET` | `/api/suggestions` | Category suggestion groups |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Client + server in watch mode |
| `npm run build` | Install deps and build the client |
| `npm start` | Start the Express server |

## Notes

- Voice needs microphone permission and works best in Chrome or Edge.
- List data lives in `server/data/list.json`. On ephemeral hosts (e.g. Railway without a volume), the file can reset on redeploy.
