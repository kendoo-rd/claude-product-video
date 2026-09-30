/**
 * Example recorder. Copy this to recorders/<n>.mjs and replace the shot list.
 *
 *   RECORD_OUT=public/1 node recorders/1.mjs
 *
 * A recorder is a shot list and nothing else. Two rules that cost real
 * rebuilds:
 *
 *   1. Box the thing BEFORE you change it. Grabbing the box after the click
 *      records the state the viewer is not being told about.
 *   2. Dwell first, act last. The build places a line so it finishes just
 *      before its beat ends, so an action performed at the start of a beat is
 *      over before the narration plays.
 */
import { startRecorder } from "./rec.mjs";

const r = await startRecorder({ out: process.env.RECORD_OUT ?? "public/1" });
const { page, BASE, glide, clickRaw, hold, grab, mark, signIn, begin, finish } = r;

await signIn();
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
/* Park the cursor somewhere neutral before the clock starts. */
await page.mouse.move(1500, 950);
await page.waitForTimeout(500);
begin();

/* ---- beat: the thing the first line names -------------------------------- */
/* Grab the box while the element is still in the state the line describes. */
await grab("nav.primary", () => {
  const el = document.querySelector("nav");
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
});
await hold("nav", 12);

/* ---- beat: an action ------------------------------------------------------ */
/* An action beat is bracketed by hand so the gesture falls inside the window
   the line is spoken over. Dwell, then act. */
await grab("cta", () => {
  const el = document.querySelector("a[href], button");
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height + 20 };
});
mark("cta.in");
await page.waitForTimeout(2600);
await glide(400, 400, 1200);
await clickRaw(page.locator("a[href], button").first(), 500);
await page.waitForTimeout(1800);
mark("cta.out");

const { length } = await finish();
console.log(`  recorded ${length.toFixed(1)}s`);
