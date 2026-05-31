# 🎙️ DubAI

**Dub any video into any language — in the original speaker's voice.**

DubAI takes a YouTube link (or an uploaded file), then transcribes, translates,
and re-voices it using ElevenLabs' dubbing engine, which clones each speaker so
the result sounds like the same person speaking another language. The default
flow dubs **English → Spanish**.

```
Video URL / file ─▶ Transcribe ─▶ Translate ─▶ Clone voice ─▶ Dubbed track
                         (ElevenLabs Dubbing API)
```

## Repository layout

| Path                         | What it is                                                        |
| ---------------------------- | ---------------------------------------------------------------- |
| `frontend/index.html`        | Marketing **landing page** (hero, features, how-it-works, demo). |
| `frontend/app.html`          | The dubbing **app** UI (paste a URL / upload, track progress).   |
| `backend/server.js`          | Express server exposing the dubbing API.                         |
| `backend/dubbing.js`         | Dependency-free core dubbing logic (used by the server + tests). |
| `backend/test/`              | Test suite (Node's built-in runner).                             |

## Quick start

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env        # then add your key:
# ELEVENLABS_API_KEY=your_key_here
npm run dev                 # http://localhost:3001

# 2. Frontend — just open the static files
open ../frontend/index.html   # landing page (links through to app.html)
```

Get an API key at **elevenlabs.io → Developers → API Keys**.

### API

| Method & path                 | Purpose                                            |
| ----------------------------- | -------------------------------------------------- |
| `POST /api/dub`               | Start a job: `{ videoUrl, sourceLang, targetLang }` or a file upload. Returns `{ dubbingId }`. |
| `GET /api/dub/:id/status`     | Poll job status.                                   |
| `GET /api/dub/:id/audio/:lang`| Download the dubbed audio for a language.          |

## Demo

The demo uses **["Me at the zoo"](https://www.youtube.com/watch?v=jNQXAC9IVRw)** —
the first video ever uploaded to YouTube (~18s of spoken English) — dubbed into
Spanish in the original speaker's voice. The same clip is pre-filled on the
landing page's **Demo** section and is the fixture in the test suite.

See [`DEMO.md`](DEMO.md) for details.

## Testing

The suite verifies that a sample YouTube video is dubbed **English → Spanish in
the original speaker's voice**, with ElevenLabs mocked so it runs offline with no
API key:

```bash
cd backend
npm test        # or: node --test
```

CI (`.github/workflows/ci.yml`) runs the suite on every push and pull request.
