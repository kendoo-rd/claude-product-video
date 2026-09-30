/**
 * Transcribe a finished film, with word timings.
 *
 * The point is auditing rather than captioning: to judge whether narration and
 * screen agree you need to know exactly what is said and exactly when. Guess
 * work is what puts the wrong line over the wrong screen.
 *
 *   node tools/transcribe.mjs out/film1.mp4 > /tmp/f1.json
 */
import fs from "node:fs";
import path from "node:path";
import cfg, { elevenLabsKey } from "./config.mjs";

const key = elevenLabsKey();
const file = process.argv[2];
if (!file) throw new Error("usage: tools/transcribe.mjs <media file>");

const form = new FormData();
form.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));
form.append("model_id", "scribe_v1");
form.append("timestamps_granularity", "word");
form.append("language_code", cfg.voice.language);

const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
  method: "POST",
  headers: { "xi-api-key": key },
  body: form,
});
if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
const out = await res.json();

/* Group words into spoken lines: a gap of half a second or more starts a new
   line, which matches how the narration was cut in the first place. */
const words = (out.words ?? []).filter((w) => w.type === "word");
const lines = [];
let cur = null;
for (const w of words) {
  if (!cur || w.start - cur.end > 0.5) {
    cur = { start: w.start, end: w.end, text: w.text };
    lines.push(cur);
  } else {
    cur.end = w.end;
    cur.text += (w.text.match(/^[',.!?]/) ? "" : " ") + w.text;
  }
}
console.log(JSON.stringify({
  file,
  lines: lines.map((l) => ({ at: +l.start.toFixed(2), to: +l.end.toFixed(2), text: l.text })),
}, null, 1));
