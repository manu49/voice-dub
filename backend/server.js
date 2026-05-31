const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const fetch = require("node-fetch");
const FormData = require("form-data");
require("dotenv").config();

const {
  API_BASE,
  buildDubbingFields,
  startDubbing,
  getDubbingStatus,
  getDubbedAudio,
} = require("./dubbing");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });
const API_KEY = process.env.ELEVENLABS_API_KEY;

// Start a dubbing job
app.post("/api/dub", upload.single("file"), async (req, res) => {
  try {
    const { videoUrl, sourceLang, targetLang } = req.body;

    let fields;
    try {
      fields = buildDubbingFields({
        videoUrl,
        sourceLang,
        targetLang,
        hasFile: !!req.file,
      });
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }

    const file = req.file
      ? {
          stream: fs.createReadStream(req.file.path),
          filename: req.file.originalname,
          contentType: req.file.mimetype,
        }
      : null;

    const result = await startDubbing({
      fetchImpl: fetch,
      FormDataImpl: FormData,
      apiKey: API_KEY,
      apiBase: API_BASE,
      fields,
      file,
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

// Check dubbing status
app.get("/api/dub/:id/status", async (req, res) => {
  try {
    const status = await getDubbingStatus({
      fetchImpl: fetch,
      apiKey: API_KEY,
      apiBase: API_BASE,
      dubbingId: req.params.id,
    });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download dubbed audio
app.get("/api/dub/:id/audio/:lang", async (req, res) => {
  try {
    const response = await getDubbedAudio({
      fetchImpl: fetch,
      apiKey: API_KEY,
      apiBase: API_BASE,
      dubbingId: req.params.id,
      lang: req.params.lang,
    });

    if (!response.ok) {
      const data = await response.json();
      return res.status(response.status).json({ error: data.detail || data });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dubbed_${req.params.lang}.mp3"`
    );
    response.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Only start listening when run directly, so the app can be imported in tests.
if (require.main === module) {
  if (!API_KEY) {
    console.error("❌  ELEVENLABS_API_KEY is not set in .env");
    process.exit(1);
  }
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🎙️  Dubbing server running on http://localhost:${PORT}`);
  });
}

module.exports = { app };
