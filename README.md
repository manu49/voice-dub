# 🎙 DubAI — ElevenLabs Video Dubbing App

A web app to dub videos into 90+ languages using the ElevenLabs Dubbing API. Paste a video URL or upload a file, pick a target language, and download the dubbed audio.

---

## Project Structure

```
dubber/
├── backend/
│   ├── server.js       ← Express API server (proxies ElevenLabs)
│   ├── package.json
│   └── .env            ← Your API key goes here
└── frontend/
    └── index.html      ← Open this in your browser
```

---

## Quick Start

### 1. Get your ElevenLabs API key
- Sign up at https://elevenlabs.io (free plan works)
- Go to **Developers → API Keys** → Create a key

### 2. Set up the backend

```bash
cd backend
npm install
```

Open `.env` and replace `your_api_key_here` with your real key:
```
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxx
```

Start the server:
```bash
npm run dev
```

You should see: `🎙️ Dubber backend running on http://localhost:3001`

### 3. Open the frontend

Just open `frontend/index.html` in your browser — no build step needed.

---

## How to Use

1. **URL tab**: Paste a direct link to an MP4, MOV, or audio file
2. **Upload tab**: Drag and drop or select a local video/audio file
3. Choose source language (or leave on Auto-detect)
4. Pick your target language
5. Click **Start Dubbing** and wait (ElevenLabs usually takes 1–5 min)
6. Download the dubbed MP3 when it's ready

---

## How It Works

```
Browser → POST /api/dub (backend)
              ↓
         ElevenLabs /v1/dubbing  [transcribe → translate → synthesize]
              ↓
         Poll /api/dub/:id/status  every 4 seconds
              ↓
         GET /api/dub/:id/audio/:lang  → download MP3
```

The backend is a thin proxy that keeps your API key **server-side only** and never exposed to the browser.

---

## Supported Languages (Sample)

English, Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese (Mandarin), Hindi, Arabic, Russian, Dutch, Polish, Turkish — and 75+ more via ElevenLabs.

---

## Tips

- For best results with multiple speakers, the API auto-detects up to 3 speakers. Videos with 1–2 clear voices work best.
- Background music is preserved by default.
- Free-tier ElevenLabs accounts have monthly minute limits — check your dashboard usage.
- Long videos take longer; test with a 1–2 minute clip first.

---

## Next Steps (Ideas to Extend)

- Add a video player that swaps the audio track in-browser
- Support YouTube URLs (use `yt-dlp` on the backend to download first)
- Add a history list of past dubbing jobs
- Let users preview/edit the transcript before dubbing
