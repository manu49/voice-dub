import express from "express";
import cors from "cors";
import multer from "multer";
import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());

const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("❌  ELEVENLABS_API_KEY is not set in .env");
  process.exit(1);
}

// POST /api/dub  — start a dubbing job
app.post("/api/dub", upload.single("file"), async (req, res) => {
  try {
    const { videoUrl, sourceLang, targetLang } = req.body;

    const form = new FormData();
    form.append("target_lang", targetLang);
    form.append("source_lang", sourceLang || "auto");
    form.append("num_speakers", "0"); // auto-detect
    form.append("highest_resolution", "true");
    form.append("drop_background_audio", "false");
    form.append("watermark", "false");

    if (req.file) {
      // File upload
      form.append("file", fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
    } else if (videoUrl) {
      // URL-based
      form.append("source_url", videoUrl);
    } else {
      return res.status(400).json({ error: "Provide either a file or videoUrl" });
    }

    const response = await fetch("https://api.elevenlabs.io/v1/dubbing", {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        ...form.getHeaders(),
      },
      body: form,
    });

    const data = await response.json();

    // Clean up temp file if uploaded
    if (req.file) fs.unlinkSync(req.file.path);

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.detail || "ElevenLabs API error" });
    }

    res.json({ dubbingId: data.dubbing_id, expectedDurationSec: data.expected_duration_sec });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dub/:id/status  — poll job status
app.get("/api/dub/:id/status", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/dubbing/${req.params.id}`,
      { headers: { "xi-api-key": API_KEY } }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.detail });
    res.json({ status: data.status, error: data.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dub/:id/audio/:lang  — download dubbed audio
app.get("/api/dub/:id/audio/:lang", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/dubbing/${req.params.id}/audio/${req.params.lang}`,
      { headers: { "xi-api-key": API_KEY } }
    );
    if (!response.ok) {
      const data = await response.json();
      return res.status(response.status).json({ error: data?.detail });
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="dubbed_${req.params.lang}.mp3"`);
    response.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("🎙️  Dubber backend running on http://localhost:3001"));
