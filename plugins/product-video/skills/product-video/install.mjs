#!/usr/bin/env node
/**
 * Scaffold a video/ workspace into a project.
 *
 *   node install.mjs <target-dir>          # default: ./video
 *
 * Copies the tooling and the templates. Never overwrites a file that already
 * exists, so running it again in a project with work in it is safe and only
 * fills in what is missing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "scaffold");
const DEST = path.resolve(process.argv[2] ?? "video");

if (!fs.existsSync(SRC)) throw new Error(`no scaffold at ${SRC}`);

let written = 0, kept = 0;
function copy(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(b, { recursive: true });
      copy(a, b);
    } else if (fs.existsSync(b)) {
      kept++;
    } else {
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.copyFileSync(a, b);
      written++;
    }
  }
}
fs.mkdirSync(DEST, { recursive: true });
copy(SRC, DEST);

console.log(`scaffolded ${DEST}`);
console.log(`  ${written} file(s) written, ${kept} left alone`);
console.log(`
next:
  cd ${DEST}
  npm install
  edit video.config.json

video.config.json needs two things before anything will render:
  voice.voiceId          an ElevenLabs voice. There is no fallback voice.
  format.endCardAt       where the end card lands. If you are using music,
                         listen to the track and put the final resolve here.

An ElevenLabs key must be in ELEVENLABS_API_KEY or ~/.elevenlabs_key.`);
