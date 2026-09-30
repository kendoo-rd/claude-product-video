/**
 * Load and validate video.config.json.
 *
 * Everything project-specific lives in that one file, so every tool here reads
 * it through this module rather than carrying its own copy of the defaults.
 * Validation is strict and early: a missing voice id used to surface as an
 * ElevenLabs 400 in the middle of a batch, several minutes in.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FILE = process.env.VIDEO_CONFIG ?? "video.config.json";

if (!fs.existsSync(FILE)) {
  throw new Error(`no ${FILE} here. Run this from the video/ directory.`);
}
const cfg = JSON.parse(fs.readFileSync(FILE, "utf8"));

/* ---- required, with the reason stated ------------------------------------ */
const problems = [];

if (!cfg.voice?.voiceId) {
  problems.push(
    "voice.voiceId is empty. There is deliberately no fallback voice: a synthetic " +
    "scratch read is how an unshippable film gets shipped. Pick a voice in " +
    "ElevenLabs and put its id here.",
  );
}
const f = cfg.format ?? {};
for (const k of ["seconds", "fps", "width", "height", "titleEndsAt", "endCardAt"]) {
  if (typeof f[k] !== "number") problems.push(`format.${k} must be a number`);
}
if (typeof f.endCardAt === "number" && typeof f.seconds === "number" && f.endCardAt >= f.seconds) {
  problems.push(`format.endCardAt (${f.endCardAt}) must be before format.seconds (${f.seconds})`);
}
if (typeof f.titleEndsAt === "number" && typeof f.endCardAt === "number" && f.titleEndsAt >= f.endCardAt) {
  problems.push(`format.titleEndsAt (${f.titleEndsAt}) must be before format.endCardAt (${f.endCardAt})`);
}
if (cfg.music && !cfg.music.file) {
  problems.push("music is set but music.file is missing. Set music to null for no music.");
}
if (cfg.music?.file && !fs.existsSync(path.join("public", cfg.music.file))) {
  problems.push(`music.file "${cfg.music.file}" is not in public/`);
}

if (problems.length) {
  for (const p of problems) console.error("  ✗ " + p);
  throw new Error(`${problems.length} problem(s) in ${FILE}`);
}

/* ---- defaults for the optional half -------------------------------------- */
cfg.pacing = { leadOut: 0.3, minGap: 0.45, borrow: 1.5, ...(cfg.pacing ?? {}) };
cfg.music = cfg.music
  ? { openLevel: 0.3, duckLevel: 0.055, finaleLevel: 0.52, ramp: 0.45, ...cfg.music }
  : null;
cfg.voice = { model: "eleven_multilingual_v2", language: "eng", ...cfg.voice };
cfg.format = { seriesLabel: "Guide", ...cfg.format };

export default cfg;
export const FORMAT = cfg.format;
export const SCREEN = cfg.format.endCardAt - cfg.format.titleEndsAt;

/** The ElevenLabs key, from the environment or the file the series uses. */
export function elevenLabsKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const file = path.join(os.homedir(), ".elevenlabs_key");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  throw new Error(
    "no ElevenLabs key. Set ELEVENLABS_API_KEY or write the key to ~/.elevenlabs_key " +
    "(chmod 600). The voice is required; there is no fallback.",
  );
}
