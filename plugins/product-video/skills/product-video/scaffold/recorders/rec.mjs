/**
 * Shared recorder harness.
 *
 * A recorder script should be only its shot list. Everything here is browser
 * setup and mark semantics, which drifted badly when it was copy-pasted per
 * film: some scripts emitted a mark before a dwell, some after, and the build
 * had to guess.
 *
 * Three things it gives you:
 *
 *   hold(name, seconds)  emits <name>.in before the pause and <name>.out after,
 *                        so the build never infers where a dwell began.
 *   grab(label, fn)      records the on-screen rectangle of whatever the
 *                        narration is about to name, at the moment it is on
 *                        screen, so spotlight boxes come from the live app.
 *   mark(name)           a bare mark, for bracketing a gesture by hand.
 *
 * Usage:
 *
 *   import { startRecorder } from "./rec.mjs";
 *   const r = await startRecorder({ out: "public/1" });
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, renameSync, readdirSync, rmSync, readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(process.env.VIDEO_CONFIG ?? "video.config.json", "utf8"));
export const VIEW = { width: cfg.format.width, height: cfg.format.height };

export async function startRecorder(opts = {}) {
  const R = cfg.recorder ?? {};
  const BASE = opts.base ?? process.env.RECORD_BASE ?? R.baseUrl;
  const CLIPS = opts.out ?? process.env.RECORD_OUT;
  if (!BASE) throw new Error("no base url: set recorder.baseUrl in video.config.json");
  if (!CLIPS) throw new Error("no output directory: pass { out } or set RECORD_OUT");
  mkdirSync(CLIPS, { recursive: true });

  const browser = await chromium.launch();
  const CTX_START = Date.now();
  const ctx = await browser.newContext({
    viewport: VIEW,
    colorScheme: opts.colorScheme ?? "light",
    recordVideo: { dir: CLIPS, size: VIEW },
  });

  /* A real pointer is not captured by the video, so draw one. */
  const cur = R.cursor ?? {};
  await ctx.addInitScript(({ fill, border, halo }) => {
    const install = () => {
      if (document.getElementById("__cur")) return;
      const c = document.createElement("div");
      c.id = "__cur";
      c.style.cssText = [
        "position:fixed", "z-index:2147483647", "left:0", "top:0", "width:20px", "height:20px",
        "margin:-10px 0 0 -10px", "border-radius:50%", `background:${fill}`,
        `border:2px solid ${border}`, `box-shadow:0 0 0 5px ${halo}`,
        "pointer-events:none", "transition:transform .08s ease", "opacity:0",
      ].join(";");
      document.body.appendChild(c);
      document.addEventListener("mousemove", (e) => {
        c.style.opacity = "1"; c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px";
      }, true);
      document.addEventListener("mousedown", () => (c.style.transform = "scale(.65)"), true);
      document.addEventListener("mouseup", () => (c.style.transform = "scale(1)"), true);
    };
    if (document.body) install();
    else document.addEventListener("DOMContentLoaded", install);
  }, {
    fill: cur.fill ?? "rgba(38,70,83,.30)",
    border: cur.border ?? "#264653",
    halo: cur.halo ?? "rgba(233,196,106,.30)",
  });

  /* Cookies set before the first paint. A consent banner across the bottom of
     every page ends up in the footage otherwise. */
  if (R.cookies?.length) {
    await ctx.addCookies(R.cookies.map((c) => ({ url: BASE, ...c })));
  }

  const page = await ctx.newPage();
  let cursor = { x: Math.round(VIEW.width / 2), y: Math.round(VIEW.height / 2) };
  let T0 = 0;
  const marks = [];
  const boxes = {};

  const at = () => (Date.now() - T0) / 1000;
  const mark = (name) => {
    marks.push({ name, t: +at().toFixed(2) });
    console.log(`  ${at().toFixed(1).padStart(5)}s  ${name}`);
  };

  async function glide(x, y, ms = 420) {
    const steps = Math.max(6, Math.round(ms / 16));
    const { x: x0, y: y0 } = cursor;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      await page.waitForTimeout(ms / steps);
    }
    cursor = { x, y };
  }

  async function glideTo(loc, ms = 420) {
    const box = await loc.boundingBox({ timeout: 12000 });
    if (!box) throw new Error("no bounding box");
    await glide(box.x + box.width / 2, box.y + box.height / 2, ms);
  }

  async function firstVisible(loc) {
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const l = loc.nth(i);
      if (await l.isVisible().catch(() => false)) return l;
    }
    return loc.first();
  }

  /* Dialog overlays report as intercepting pointer events, which blocks
     locator.click(), but a real click still lands. */
  async function clickRaw(loc, ms = 420) {
    const t = await firstVisible(loc);
    await glideTo(t, ms);
    await page.waitForTimeout(110);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
  }

  async function typeInto(loc, text, ms = 380) {
    await glideTo(loc, ms);
    await page.mouse.down();
    await page.mouse.up();
    await loc.fill("");
    await loc.type(text, { delay: 40 });
  }

  async function pickOption(re, label) {
    await page.waitForSelector('[role="option"]', { timeout: 15000 });
    await page.waitForTimeout(400);
    const m = page.getByRole("option", { name: re }).first();
    if (await m.count()) await clickRaw(m, 320);
    else {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(200);
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(700);
    if (label) console.log(`         picked ${label}`);
  }

  /** Rest on something for a while, bracketed by marks. */
  async function hold(name, seconds, moveTo) {
    if (moveTo) await glide(moveTo[0], moveTo[1], 900);
    mark(`${name}.in`);
    await page.waitForTimeout(seconds * 1000);
    mark(`${name}.out`);
  }

  /** Capture the rectangle of whatever is about to be talked about.
   *  Call this BEFORE the interaction that changes it. */
  async function grab(label, fn, pad = 6) {
    const r = await page.evaluate(fn).catch(() => null);
    if (!r) return console.log(`         box ${label}: NOT FOUND`);
    boxes[label] = {
      x: Math.round(r.x) - pad,
      y: Math.round(r.y) - pad,
      w: Math.round(r.width ?? r.w) + pad * 2,
      h: Math.round(r.height ?? r.h) + pad * 2,
    };
    console.log(`         box ${label}: ${JSON.stringify(boxes[label])}`);
  }

  /** Sign in, if recorder.auth is configured. */
  async function signIn() {
    const a = R.auth;
    if (!a) return;
    await page.goto(`${BASE}${a.path ?? "/login"}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    await page.fill(a.emailSelector ?? 'input[type="email"]', process.env.RECORD_EMAIL ?? a.email);
    await page.fill(a.passwordSelector ?? 'input[type="password"]', process.env.RECORD_PASSWORD ?? a.password);
    await page.click(a.submitSelector ?? 'button[type="submit"]');
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(a.settleMs ?? 4000);
  }

  /** Start the clock. Everything before this is setup and gets trimmed away. */
  function begin() {
    T0 = Date.now();
    console.log(`  TRIM_FROM=${((T0 - CTX_START) / 1000).toFixed(2)}`);
  }

  async function finish() {
    const END = at();
    marks.push({ name: "end", t: +END.toFixed(2) });
    writeFileSync(
      `${CLIPS}/marks.json`,
      JSON.stringify({ trimFrom: (T0 - CTX_START) / 1000, marks, boxes }, null, 2),
    );
    const video = page.video();
    await ctx.close();
    console.log(`\n  LENGTH ${END.toFixed(1)}s`);
    const path = video ? await video.path() : null;
    await browser.close();
    /* Put the recording where the build expects it. Without this the raw
       page@<hash>.webm files pile up and clip.webm stays whatever it was, so a
       re-record silently produces new marks against the old footage. That has
       cost three rebuild cycles. */
    if (!path) throw new Error("no video was recorded");
    renameSync(path, `${CLIPS}/clip.webm`);
    for (const f of readdirSync(CLIPS)) {
      if (/^page@.*\.webm$/.test(f)) rmSync(`${CLIPS}/${f}`, { force: true });
    }
    console.log(`  -> ${CLIPS}/clip.webm`);

    const need = cfg.format.endCardAt - cfg.format.titleEndsAt;
    if (END < need) {
      console.log(`  WARNING: ${END.toFixed(1)}s recorded but the film needs ${need}s of screen`);
    }
    return { length: END, path };
  }

  return {
    BASE, page, ctx, browser,
    glide, glideTo, clickRaw, typeInto, pickOption, firstVisible,
    mark, hold, grab, signIn, begin, finish,
  };
}
