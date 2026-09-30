/**
 * Encode one finished film for publishing: an h264 mp4 that starts playing
 * before it has finished downloading, a poster frame, and captions whose cue
 * times come from the film config itself.
 *
 *   node tools/encode.mjs <n> [master.mp4]
 *
 * Writes into out/<slug>/. Deployment is the project's business; this only
 * produces the files.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import { FF } from "./ffmpeg.mjs";
import { FORMAT } from "./config.mjs";

const n = process.argv[2];
if (!n) throw new Error("usage: tools/encode.mjs <n> [master]");
const master = process.argv[3] ?? `out/film${n}.mp4`;
if (!fs.existsSync(master)) throw new Error(`no master at ${master} — render it first`);

const film = JSON.parse(fs.readFileSync(`src/films/${n}.json`, "utf8"));
const dir = `out/${film.slug}`;
fs.mkdirSync(dir, { recursive: true });

execSync(`${FF} -loglevel error -i ${master} -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart ${dir}/video.mp4 -y`);
execSync(`${FF} -loglevel error -ss 1.2 -i ${master} -frames:v 1 -vf scale=1280:-1 -q:v 4 ${dir}/poster.jpg -y`);

const srt = `out/${n}.srt`;
const text = fs.readFileSync(srt, "utf8").split(/\n\n+/)
  .map((b) => b.split("\n").slice(2).join(" ").trim()).filter(Boolean);
if (text.length !== film.vo.length) {
  throw new Error(`film ${n}: ${film.vo.length} lines but ${text.length} captions`);
}
const dashed = text.filter((t) => t.includes("—") || t.includes("–"));
if (dashed.length) throw new Error(`film ${n}: dash in a caption: ${dashed[0]}`);

const ts = (t) => `00:${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(3).padStart(6, "0")}`;
fs.writeFileSync(`${dir}/captions.vtt`,
  "WEBVTT\n\n" + film.vo.map((c, i) => `${i + 1}\n${ts(c.at)} --> ${ts(c.at + c.dur)}\n${text[i]}\n`).join("\n"));

const probe = execSync(`${FF} -i ${dir}/video.mp4 2>&1 || true`, { encoding: "utf8" });
const d = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
const secs = d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : 0;
if (Math.abs(secs - FORMAT.seconds) > 0.5) {
  console.log(`  WARNING: ${secs.toFixed(2)}s, but the format says ${FORMAT.seconds}s`);
}
console.log(
  `  ${film.slug}: ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")},`,
  `${(fs.statSync(`${dir}/video.mp4`).size / 1e6).toFixed(1)} MB, ${film.vo.length} cues`,
);
console.log(`  -> ${dir}/{video.mp4, poster.jpg, captions.vtt}`);
