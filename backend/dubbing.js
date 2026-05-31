// Core dubbing logic, separated from the Express wiring so it can be unit
// tested without spinning up a server or hitting the real ElevenLabs API.
//
// ElevenLabs' dubbing endpoint clones each detected speaker's voice and speaks
// the translation back in that same voice, so a dub produced this way keeps the
// *original speaker's voice* — we never pass a replacement voice id.

// A short, public, English-language clip used as the product demo and as the
// fixture in the test suite: "Me at the zoo", the first video uploaded to
// YouTube (~18 seconds of spoken English).
const SAMPLE_VIDEO = Object.freeze({
  title: "Me at the zoo",
  videoId: "jNQXAC9IVRw",
  url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  sourceLang: "en",
  targetLang: "es",
  durationLabel: "0:18",
});

const DUBBING_DEFAULTS = Object.freeze({
  sourceLang: "auto",
  targetLang: "es",
  // "0" => auto-detect every speaker. ElevenLabs then clones each original
  // voice, which is what preserves the speaker's own voice in the dub.
  numSpeakers: "0",
  highestResolution: "true",
});

const API_BASE = "https://api.elevenlabs.io/v1";

/**
 * Build the multipart field set for an ElevenLabs dubbing request.
 * Throws if neither a video URL nor an uploaded file is supplied.
 */
function buildDubbingFields({ videoUrl, sourceLang, targetLang, hasFile = false } = {}) {
  if (!videoUrl && !hasFile) {
    throw new Error("A video URL or file is required to start dubbing");
  }
  const fields = {
    source_lang: sourceLang || DUBBING_DEFAULTS.sourceLang,
    target_lang: targetLang || DUBBING_DEFAULTS.targetLang,
    num_speakers: DUBBING_DEFAULTS.numSpeakers,
    highest_resolution: DUBBING_DEFAULTS.highestResolution,
  };
  if (videoUrl) fields.source_url = videoUrl;
  return fields;
}

function appendFields(form, fields) {
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return form;
}

/**
 * Submit a dubbing job. `fetchImpl` and `FormDataImpl` are injected so tests can
 * pass fakes; in production these are node-fetch and form-data.
 */
async function startDubbing({
  fetchImpl,
  FormDataImpl,
  apiKey,
  apiBase = API_BASE,
  fields,
  file = null,
}) {
  const form = new FormDataImpl();
  appendFields(form, fields);
  if (file) {
    form.append("file", file.stream, {
      filename: file.filename,
      contentType: file.contentType,
    });
  }

  const headers = { "xi-api-key": apiKey };
  if (typeof form.getHeaders === "function") {
    Object.assign(headers, form.getHeaders());
  }

  const response = await fetchImpl(`${apiBase}/dubbing`, {
    method: "POST",
    headers,
    body: form,
  });
  const data = await response.json();

  if (!response.ok) {
    const err = new Error(
      (data && (data.detail || data.error)) || "Dubbing request failed"
    );
    err.status = response.status;
    err.body = data;
    throw err;
  }

  return {
    dubbingId: data.dubbing_id,
    expectedDurationSec: data.expected_duration_sec,
  };
}

/** Poll the status of a dubbing job. */
async function getDubbingStatus({ fetchImpl, apiKey, apiBase = API_BASE, dubbingId }) {
  const response = await fetchImpl(`${apiBase}/dubbing/${dubbingId}`, {
    headers: { "xi-api-key": apiKey },
  });
  const data = await response.json();
  return { status: data.status, error: data.error };
}

/** Fetch the dubbed audio for a given language. Returns the raw response so the
 * caller can stream the body (production) or inspect it (tests). */
async function getDubbedAudio({ fetchImpl, apiKey, apiBase = API_BASE, dubbingId, lang }) {
  return fetchImpl(`${apiBase}/dubbing/${dubbingId}/audio/${lang}`, {
    headers: { "xi-api-key": apiKey },
  });
}

module.exports = {
  SAMPLE_VIDEO,
  DUBBING_DEFAULTS,
  API_BASE,
  buildDubbingFields,
  appendFields,
  startDubbing,
  getDubbingStatus,
  getDubbedAudio,
};
