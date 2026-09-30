/**
 * Generate the narration for one film, in the series voice.
 *
 *   node tools/tts.mjs 1
 *
 * Reads lines/<n>.json, writes public/vo-<n>/seg<k>.mp3 and the matching
 * out/<n>.srt, so the caption text can never drift from what is spoken.
 *
 * Refuses an em dash outright: it changes how the voice paces a line, and the
 * encoder rejects it in captions anyway.
 *
 * There is no fallback voice. A synthetic scratch read that sounds "close
 * enough" is exactly how an unshippable film gets shipped.
 */
import fs from "node:fs";
import cfg, { elevenLabsKey } from "./config.mjs";

const n = process.argv[2];
if (!n) throw new Error("usage: tools/tts.mjs <film number>");

const key = elevenLabsKey();
const spec = JSON.parse(fs.readFileSync(`lines/${n}.json`, "utf8"));
const lines = spec.lines ?? spec;
const voice = spec.voice ?? cfg.voice.voiceId;

const bad = lines.filter((l) => l.includes("—") || l.includes("–"));
if (bad.length) throw new Error(`dash in a line, rewrite it: ${bad[0]}`);
const empty = lines.findIndex((l) => !l || !l.trim());
if (empty >= 0) throw new Error(`line ${empty + 1} is empty`);

const dir = `public/vo-${n}`;
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync("out", { recursive: true });

for (let i = 0; i < lines.length; i++) {
  const out = `${dir}/seg${i + 1}.mp3`;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: lines[i],
      model_id: cfg.voice.model,
      voice_settings: cfg.voice.settings,
    }),
  });
  if (!res.ok) throw new Error(`line ${i + 1}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log(`  ${String(i + 1).padStart(2)}  ${(buf.length / 1024).toFixed(0).padStart(4)} kB  ${lines[i]}`);
}

/* Cue times are filled in later by the encoder from the film config; the srt
   here only has to carry the text, in order. */
fs.writeFileSync(
  `out/${n}.srt`,
  lines.map((t, i) => `${i + 1}\n00:00:00,000 --> 00:00:01,000\n${t}\n`).join("\n"),
);
console.log(`\n${lines.length} lines -> ${dir} and out/${n}.srt`);

/* The duration cache is keyed by path, so a stale entry would silently reuse
   the length of a line that has since been rewritten. */
const CACHE = "public/vo-durations.json";
if (fs.existsSync(CACHE)) {
  const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  let dropped = 0;
  for (const k of Object.keys(cache)) {
    if (k.startsWith(`vo-${n}/`)) { delete cache[k]; dropped++; }
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  if (dropped) console.log(`cleared ${dropped} stale duration(s) from the cache`);
}
