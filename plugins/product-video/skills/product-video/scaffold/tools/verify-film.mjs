/**
 * Check a finished film, line by line.
 *
 *   node tools/verify-film.mjs <n> out/film<n>.mp4 out/<n>.srt
 *
 * Three things, because each catches what the others cannot:
 *
 *  1. Three whole frames per line, at its start, middle and end. The midpoint
 *     alone hides a mismatch that appears while the line is still being spoken.
 *
 *  2. The spotlight, cropped at native resolution. The whole frame is scaled to
 *     420px for the sheet, which turns a 48px button into ten pixels: a guide
 *     shipped narrating "the plus button" over a button that had turned into a
 *     close X, and nobody could have seen it at that size.
 *
 *  3. Motion, for any line that claims an action. "Drag the card to a new column" is
 *     not checkable from stills, and a guide shipped the result of a drag with
 *     no drag in it. For a line containing an action verb this samples across
 *     the line and measures whether the spotlit region actually changes.
 *
 * Exits non-zero when the motion check finds a defect, so it can gate a ship.
 *
 * The difference is measured in the browser that already renders the contact
 * sheet: Remotion ships a very reduced ffmpeg with no tblend and no
 * signalstats, so it cannot difference frames itself, and Chromium is a
 * perfectly good JPEG decoder that is already a dependency here.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { FF } from "./ffmpeg.mjs";
import { FORMAT } from "./config.mjs";

const [n, mp4, srtPath] = process.argv.slice(2);
if (!n || !mp4) throw new Error("usage: tools/verify-film.mjs <n> <mp4> [srt]");

const film = JSON.parse(fs.readFileSync(`src/films/${n}.json`, "utf8"));
const text = srtPath && fs.existsSync(srtPath)
  ? fs.readFileSync(srtPath, "utf8").split(/\n\n+/)
      .map((b) => b.split("\n").slice(2).join(" ").trim()).filter(Boolean)
  : [];

/* A line promising one of these is promising something the viewer should see
   happen, not merely its outcome. */
const ACTION =
  /\b(drag(ging|s)?|click(ing|s)?|press(ing|es)?|typ(e|ing|es)|scroll(ing|s)?|slide|swipe|move|resize|tick|toggle|select(ing|s)?|drop)\b/i;
const SAMPLES = 8;
/* Share of the spotlight that has to change for the action to count as shown.
   Measured as a fraction of pixels rather than a mean difference: a pale
   selection growing smoothly moves the average by almost nothing while a third
   of the region is visibly different. */
const CHANGED_DELTA = 6;   // luma steps that count as "this pixel changed"
const MIN_CHANGED = 0.02;  // 2% of the region

const TMP = "/tmp/pv-verify";
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

/** Bring a box inside the frame; a recorded box can overhang by a few pixels. */
function clamp([x, y, w, h]) {
  const nx = Math.max(0, Math.round(x));
  const ny = Math.max(0, Math.round(y));
  const nw = Math.max(2, Math.min(FORMAT.width - nx, Math.round(w) + Math.min(0, Math.round(x))));
  const nh = Math.max(2, Math.min(FORMAT.height - ny, Math.round(h) + Math.min(0, Math.round(y))));
  return [nx, ny, nw, nh];
}

/* Sizes are computed rather than left to scale=-1: a spotlight can be very
   wide and only a few dozen pixels tall, and the automatic height then rounds
   to zero and ffmpeg refuses the filter. */
function shot(t, out, box) {
  let vf = "scale=420:-2";
  if (box) {
    const [cx, cy, cw, ch] = clamp(box);
    const outW = Math.max(160, Math.min(760, cw));
    const outH = Math.max(2, Math.round((ch * outW) / cw / 2) * 2);
    vf = `crop=${cw}:${ch}:${cx}:${cy},scale=${outW}:${outH}`;
  }
  execSync(`${FF} -loglevel error -ss ${t.toFixed(2)} -i ${mp4} -frames:v 1 -vf "${vf}" -q:v 3 ${out} -y`);
}

/** The spotlight covering a line, if any. */
const boxFor = (c) =>
  (film.spot ?? []).find((s) => s.from < c.at + c.dur - 0.05 && s.to > c.at + 0.05)?.box ?? null;

const at = (c) => [
  ["start", c.at + 0.25],
  ["mid", c.at + c.dur / 2],
  ["end", c.at + c.dur - 0.25],
];

/* ---- extract every frame this check needs -------------------------------- */
const lines = film.vo.map((c, i) => {
  const label = text[i] || "";
  const box = boxFor(c);
  const crop = box ? box.map(Math.round) : null;

  const full = at(c).map(([k, t], j) => {
    const f = `${TMP}/${i}${j}.jpg`;
    shot(t, f);
    return { k, t, f };
  });
  const zoom = crop
    ? at(c).map(([k, t], j) => {
        const f = `${TMP}/${i}${j}z.jpg`;
        shot(t, f, crop);
        return { k, t, f };
      })
    : [];

  const isAction = ACTION.test(label);
  let strip = [];
  if (isAction && crop) {
    strip = Array.from({ length: SAMPLES }, (_, k) => {
      const t = c.at + ((k + 0.5) * c.dur) / SAMPLES;
      const f = `${TMP}/${i}m${k}.jpg`;
      shot(t, f, crop);
      return { t, f };
    });
  }
  return { i, label, box, isAction, full, zoom, strip };
});

/* ---- one browser: measure motion, then render the sheet ------------------ */
const require = createRequire(`${process.cwd()}/x.js`);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 300 } });

async function motionOf(files) {
  return page.evaluate(async ({ files: paths, delta }) => {
    const load = (src) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
    const S = 64;
    const cv = document.createElement("canvas");
    cv.width = S; cv.height = S;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    const grays = [];
    for (const p of paths) {
      const im = await load(p);
      cx.drawImage(im, 0, 0, S, S);
      const d = cx.getImageData(0, 0, S, S).data;
      const g = new Float32Array(S * S);
      for (let k = 0; k < g.length; k++) {
        g[k] = 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
      }
      grays.push(g);
    }
    const changed = (a, b) => {
      let c = 0;
      for (let j = 0; j < a.length; j++) if (Math.abs(a[j] - b[j]) > delta) c++;
      return c / a.length;
    };
    /* First against last catches a slow smooth gesture that consecutive frames
       barely differ across; consecutive catches an abrupt change that happens
       and then reverts. */
    let worst = changed(grays[0], grays[grays.length - 1]);
    for (let k = 1; k < grays.length; k++) worst = Math.max(worst, changed(grays[k - 1], grays[k]));
    return worst;
  }, { files, delta: CHANGED_DELTA });
}

await page.goto("about:blank");
const defects = [];
for (const L of lines) {
  if (!L.isAction) continue;
  if (!L.box) {
    defects.push(`${L.i + 1}. "${L.label}" claims an action but has no spotlight to check`);
    continue;
  }
  /* Passed as data URLs: a page at about:blank cannot load file:// images, and
     giving the sheet a file origin just to measure is more moving parts than
     encoding eight thumbnails. Logged for every action line, passing or not: a
     threshold nobody can see the numbers behind is one nobody can trust. */
  L.motion = await motionOf(
    L.strip.map((s) => "data:image/jpeg;base64," + fs.readFileSync(s.f).toString("base64")),
  );
  console.log(`  line ${L.i + 1}: ${(L.motion * 100).toFixed(1)}% of the spotlight changes  "${L.label.slice(0, 46)}"`);
  if (L.motion < MIN_CHANGED) {
    defects.push(`${L.i + 1}. "${L.label}" claims an action but only ${(L.motion * 100).toFixed(1)}% of the spotlight changes`);
  }
}

const rows = lines.map((L) => {
  const row = (cells) => `<div class="r">${cells
    .map((c) => `<figure><img src="file://${c.f}"><figcaption>${c.k} ${c.t.toFixed(1)}s</figcaption></figure>`)
    .join("")}</div>`;
  const zoomRow = L.zoom.length
    ? `<div class="r">${L.zoom.map((c) => `<figure><img src="file://${c.f}"><figcaption>spotlight, ${c.k}</figcaption></figure>`).join("")}</div>`
    : "";
  const motionRow = L.isAction && L.box
    ? `<div class="m"><b>action verb &mdash; spotlight over time: ${
        L.motion < MIN_CHANGED ? "STATIC, defect" : `${(L.motion * 100).toFixed(0)}% of the region changes`
      }</b><div class="strip">${L.strip.map((s) => `<img class="s" src="file://${s.f}">`).join("")}</div></div>`
    : "";
  return `<section><h3>${L.i + 1}. ${L.label.replace(/[<>]/g, "")}</h3>${row(L.full)}${zoomRow}${motionRow}</section>`;
});

fs.writeFileSync(`${TMP}/sheet.html`,
  `<style>body{margin:0;background:#fff;font:12px -apple-system;padding:8px}
section{margin-bottom:14px;border-bottom:1px solid #eee;padding-bottom:10px}
h3{font-size:13px;margin:0 0 4px;font-weight:600}
.r{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px}
img{width:100%;display:block;border:1px solid #bbb}figure{margin:0}
figcaption{font:11px ui-monospace;color:#555;padding:2px}
.m{margin-top:4px}.strip{display:flex;gap:3px;margin-top:3px}
.s{width:auto;height:110px;border:1px solid #bbb}
</style>${rows.join("")}`);
await page.goto(`file://${TMP}/sheet.html`);
const sheet = `out/verify-${n}.png`;
fs.mkdirSync("out", { recursive: true });
await page.screenshot({ path: sheet, fullPage: true });
await browser.close();

console.log(`→ ${sheet}`);
if (defects.length) {
  console.log("\nDEFECTS:");
  for (const d of defects) console.log("  ✗ " + d);
  process.exit(1);
}
console.log("motion check: every line claiming an action shows it");
console.log("now look at the sheet and answer the six questions in the skill");
