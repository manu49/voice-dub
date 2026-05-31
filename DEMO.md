# Demo: English → Spanish in the original voice

DubAI's canonical demo dubs a short, instantly recognizable English clip into
Spanish while keeping the original speaker's voice.

## The clip

| | |
| --- | --- |
| **Title** | Me at the zoo |
| **URL** | https://www.youtube.com/watch?v=jNQXAC9IVRw |
| **Length** | ~18 seconds |
| **Why this one** | It's the first video ever uploaded to YouTube — short, public, and spoken in plain English, ideal for a fast, reproducible dubbing demo. |

The clip is defined once as `SAMPLE_VIDEO` in [`backend/dubbing.js`](backend/dubbing.js)
and reused by both the landing page demo and the test suite.

## What the demo shows

| | Text |
| --- | --- |
| **Original (English)** | "All right, so here we are in front of the elephants. The cool thing about these guys is that they have really, really, really long trunks…" |
| **Dubbed (Spanish, same voice)** | "Muy bien, aquí estamos frente a los elefantes. Lo genial de estos animales es que tienen trompas muy, muy, muy largas…" |

## Try it in the browser

1. Open `frontend/index.html` — the landing page — and scroll to the **Demo**
   section to see the side-by-side and watch the source clip.
2. Click **“Dub this video yourself”**. That deep-links to the app
   (`frontend/app.html?url=…&source=en&target=es`) with the YouTube URL and the
   English → Spanish languages pre-filled.
3. With the backend running (and an `ELEVENLABS_API_KEY` set), press
   **Start Dubbing** to produce a real Spanish dub in the original voice.

## Run it as a test

The exact same clip drives the automated suite, which mocks ElevenLabs so it
needs no API key or network:

```bash
cd backend
npm test            # or: node --test
```

The headline cases in `backend/test/dubbing.test.js` assert that the sample
video is:

1. requested with **source = English, target = Spanish**,
2. dubbed in the **original speaker's voice** (auto speaker detection, no voice
   override), and
3. carried through the full **start → poll status → download Spanish audio** flow.
