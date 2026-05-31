// Test suite for the dubbing pipeline.
//
// Headline scenario: a sample English YouTube video is dubbed into Spanish in
// the original speaker's voice. External calls to ElevenLabs are faked, so the
// suite runs offline, with no API key, using only Node's built-in test runner:
//
//     node --test            (or: npm test)

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SAMPLE_VIDEO,
  buildDubbingFields,
  startDubbing,
  getDubbingStatus,
  getDubbedAudio,
} = require("../dubbing");

const API_BASE = "https://api.elevenlabs.io/v1";

// Minimal stand-in for the `form-data` package: records appended fields/files.
class FakeFormData {
  constructor() {
    this.fields = {};
    this.files = [];
  }
  append(key, value, opts) {
    if (key === "file") this.files.push({ value, opts });
    else this.fields[key] = value;
  }
  getHeaders() {
    return { "content-type": "multipart/form-data; boundary=----fake" };
  }
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

test("builds an English -> Spanish request for the sample YouTube video", () => {
  const fields = buildDubbingFields({
    videoUrl: SAMPLE_VIDEO.url,
    sourceLang: "en",
    targetLang: "es",
  });

  assert.equal(fields.source_url, SAMPLE_VIDEO.url);
  assert.equal(fields.source_lang, "en");
  assert.equal(fields.target_lang, "es");
});

test("preserves the original speaker's voice (auto speaker detection, no voice override)", () => {
  const fields = buildDubbingFields({
    videoUrl: SAMPLE_VIDEO.url,
    sourceLang: "en",
    targetLang: "es",
  });

  // num_speakers "0" => auto-detect and clone each original speaker's voice.
  assert.equal(fields.num_speakers, "0");
  // We never send a replacement voice, so ElevenLabs keeps the original voice.
  assert.equal(fields.voice_id, undefined);
});

test("defaults the target language to Spanish", () => {
  const fields = buildDubbingFields({ videoUrl: SAMPLE_VIDEO.url });
  assert.equal(fields.target_lang, "es");
});

test("requires a video URL or an uploaded file", () => {
  assert.throws(() => buildDubbingFields({}), /required/);
});

test("startDubbing posts the sample video to the ElevenLabs dubbing endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return jsonResponse({ dubbing_id: "dub_123", expected_duration_sec: 18 });
  };

  const fields = buildDubbingFields({
    videoUrl: SAMPLE_VIDEO.url,
    sourceLang: "en",
    targetLang: "es",
  });
  const result = await startDubbing({
    fetchImpl,
    FormDataImpl: FakeFormData,
    apiKey: "test-key",
    apiBase: API_BASE,
    fields,
  });

  assert.equal(result.dubbingId, "dub_123");
  assert.equal(result.expectedDurationSec, 18);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API_BASE}/dubbing`);
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.headers["xi-api-key"], "test-key");

  // The multipart body carried our English -> Spanish fields for the sample.
  assert.equal(calls[0].opts.body.fields.source_lang, "en");
  assert.equal(calls[0].opts.body.fields.target_lang, "es");
  assert.equal(calls[0].opts.body.fields.source_url, SAMPLE_VIDEO.url);
});

test("end to end: sample video is dubbed EN->ES and the Spanish track downloads", async () => {
  const fetchImpl = async (url, opts = {}) => {
    if (url === `${API_BASE}/dubbing` && opts.method === "POST") {
      return jsonResponse({ dubbing_id: "dub_abc", expected_duration_sec: 18 });
    }
    if (url === `${API_BASE}/dubbing/dub_abc`) {
      return jsonResponse({ status: "dubbed", error: null });
    }
    if (url === `${API_BASE}/dubbing/dub_abc/audio/es`) {
      return { ok: true, status: 200, body: "<spanish-mp3-bytes>" };
    }
    throw new Error(`unexpected request: ${url}`);
  };

  const api = { fetchImpl, apiKey: "test-key", apiBase: API_BASE };

  const fields = buildDubbingFields({
    videoUrl: SAMPLE_VIDEO.url,
    sourceLang: "en",
    targetLang: "es",
  });
  const { dubbingId } = await startDubbing({ ...api, FormDataImpl: FakeFormData, fields });
  assert.equal(dubbingId, "dub_abc");

  const status = await getDubbingStatus({ ...api, dubbingId });
  assert.equal(status.status, "dubbed");

  const audio = await getDubbedAudio({ ...api, dubbingId, lang: "es" });
  assert.equal(audio.ok, true);
  assert.equal(audio.body, "<spanish-mp3-bytes>");
});

test("startDubbing surfaces ElevenLabs API errors", async () => {
  const fetchImpl = async () =>
    jsonResponse({ detail: "invalid api key" }, { ok: false, status: 401 });

  await assert.rejects(
    startDubbing({
      fetchImpl,
      FormDataImpl: FakeFormData,
      apiKey: "bad-key",
      apiBase: API_BASE,
      fields: buildDubbingFields({ videoUrl: SAMPLE_VIDEO.url }),
    }),
    /invalid api key/
  );
});
