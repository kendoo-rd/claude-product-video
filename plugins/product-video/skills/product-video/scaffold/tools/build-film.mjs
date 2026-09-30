/**
 * Turns a recording plus a shot spec into a film config.
 *
 *   node tools/build-film.mjs specs/1.json
 *
 * The spec says which beats to use, which narration line belongs to each, and
 * what to box. Everything else is arithmetic, and doing it here rather than by
 * hand is the point: films get mistimed when a human estimates where a beat
 * began.
 *
 * Two rules the format depends on:
 *
 *   - The film is exactly format.seconds long and the end card lands at
 *     format.endCardAt, on the music's resolve if there is music. So the beats
 *     have to add up to (endCardAt - titleEndsAt) of screen.
 *   - A line ends just before its beat ends, so it plays *over* the thing it
 *     describes rather than as the screen moves on.
 *
 * It refuses to emit a film whose narration overruns the live screen or
 * overlaps itself. Both of those have shipped before.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import cfg, { FORMAT, SCREEN } from "./config.mjs";

const CLIP_AT = FORMAT.titleEndsAt;
const CARD_AT = FORMAT.endCardAt;
const { leadOut: LEAD_OUT, minGap: MIN_GAP, borrow: BORROW } = cfg.pacing;
const { width: W_FRAME, height: H_FRAME } = FORMAT;

const specPath = process.argv[2];
if (!specPath) throw new Error("usage: tools/build-film.mjs <spec.json>");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

const marksFile = `public/${spec.clipDir}/marks.json`;
if (!fs.existsSync(marksFile)) {
  throw new Error(`no ${marksFile}. Record the film before building it.`);
}
const rec = JSON.parse(fs.readFileSync(marksFile, "utf8"));
const trim = rec.trimFrom ?? 0;

/** Beat windows in the recording's own timeline. */
const beats = {};
for (const m of rec.marks) {
  const [name, edge] = m.name.split(".");
  if (!edge) continue;
  beats[name] = beats[name] || {};
  beats[name][edge] = trim + m.t;
}

/** Narration lengths, probed once and cached across runs.
 *  Lines are keyed by path, because a film sometimes borrows a take from a
 *  neighbour rather than inventing a new way to say the same thing. */
const CACHE = "public/vo-durations.json";
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
function durationOf(src) {
  if (cache[src]) return cache[src];
  const probe = execSync(`npx remotion ffprobe public/${src} 2>&1`, { encoding: "utf8" });
  const m = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const d = m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0;
  if (!d) throw new Error(`could not read the length of ${src}`);
  cache[src] = d;
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  return d;
}

const lineCount = spec.lines.length;
const durs = spec.lines.map(durationOf);

/* Pacing is decided across the whole film, not inside each beat. Per beat, a
   beat with two lines and plenty of room put all its slack into one long hole,
   which is exactly the dead screen this format exists to remove. One gap
   length for the entire film gives an even rhythm, and each beat is then made
   exactly as long as the lines it carries. */
const flat = [];
spec.beats.forEach((b, bi) => {
  const labels = b.boxes ?? (b.box ? b.lines.map(() => b.box) : []);
  b.lines.forEach((idx, k) => flat.push({ idx, beat: bi, box: labels[k] ?? null }));
});

const openerEnd = spec.opener != null ? 0.6 + durs[spec.opener] : 0;
const speechTotal = flat.reduce((sum, f) => sum + durs[f.idx], 0);
const gap = (SCREEN - speechTotal) / (flat.length + 1);
if (gap < MIN_GAP) {
  console.error(`  ✗ ${speechTotal.toFixed(1)}s of narration will not fit in ${SCREEN}s of screen`);
  throw new Error("too much narration for the film");
}
/* No cap. Any cap below the even spread just moves the slack to the end of the
   film instead of removing it. A film with little to say gets long pauses
   wherever they fall; the honest fix is more to say, not a tighter cap that
   hides them all in one place. */
if (gap > 6) {
  console.log(`  note: only ${speechTotal.toFixed(1)}s of narration for ${SCREEN}s, so pauses run ${gap.toFixed(1)}s`);
}

const segments = [];
const spot = [];
const vo = Array(lineCount).fill(null);
const problems = [];

/* Lay the lines down end to end with one rhythm. */
let t = Math.max(CLIP_AT + gap, openerEnd + MIN_GAP);
for (const f of flat) {
  vo[f.idx] = { src: spec.lines[f.idx], at: +t.toFixed(2), dur: +durs[f.idx].toFixed(2) };
  t += durs[f.idx] + gap;
}

/* Each beat runs from where the previous ended to halfway through the pause
   after its final line, so the cut happens in silence. */
let segStart = CLIP_AT;
spec.beats.forEach((b, bi) => {
  const mine = flat.filter((f) => f.beat === bi);
  const win = beats[b.beat];
  if (!win || win.in == null || win.out == null) {
    problems.push(`beat "${b.beat}" has no in/out marks — have ${Object.keys(beats).join(", ")}`);
    return;
  }
  const lastLine = vo[mine[mine.length - 1].idx];
  const isLast = bi === spec.beats.length - 1;
  const segEnd = isLast ? CARD_AT : lastLine.at + lastLine.dur + gap / 2;
  const len = segEnd - segStart;

  /* A beat may reach a little before its hold began: those frames are the
     cursor gliding onto the same screen, so they read as part of the shot.
     Beyond that the shot genuinely was not held long enough, and the recording
     has to be redone. */
  const recorded = win.out - win.in;
  if (len > recorded + BORROW) {
    problems.push(`beat "${b.beat}" needs ${len.toFixed(1)}s but was only held for ${recorded.toFixed(1)}s`);
  }
  segments.push({
    at: +segStart.toFixed(2),
    len: +len.toFixed(2),
    from: +Math.max(win.in - BORROW, win.out - len).toFixed(2),
  });

  for (const f of mine) {
    if (!f.box) continue;
    const box = rec.boxes?.[f.box];
    if (!box) {
      problems.push(`no captured box "${f.box}" — have ${Object.keys(rec.boxes ?? {}).join(", ")}`);
      continue;
    }
    const line = vo[f.idx];
    /* A spotlight outside the frame draws nothing at all and the film still
       renders, so it stays invisible until somebody watches for it. A guide
       once shipped with its closing box below the bottom of the frame and no
       highlight anywhere. Refuse it here instead. */
    const [bx, by, bw, bh] = [box.x, box.y, box.w, box.h];
    const inside =
      Math.max(0, Math.min(bx + bw, W_FRAME) - Math.max(bx, 0)) *
      Math.max(0, Math.min(by + bh, H_FRAME) - Math.max(by, 0));
    const area = Math.max(1, bw * bh);
    if (inside / area < 0.5) {
      problems.push(
        `box "${f.box}" is outside the frame (${Math.round((inside / area) * 100)}% visible at ` +
        `x=${Math.round(bx)} y=${Math.round(by)} w=${Math.round(bw)} h=${Math.round(bh)}), so nothing would be highlighted`,
      );
      continue;
    }
    spot.push({
      from: +line.at.toFixed(2),
      to: +(line.at + line.dur).toFixed(2),
      box: [box.x, box.y, box.w, box.h],
    });
  }
  segStart = segEnd;
});

/* The opening line plays over the title card, before any beat. */
if (spec.opener != null) {
  vo[spec.opener] = { src: spec.lines[spec.opener], at: 0.6, dur: +durs[spec.opener].toFixed(2) };
}

/* The sign-off belongs on the end card: it points at the next film rather than
   at anything on screen, so it is the one line allowed past the card. */
const signoffIndex = spec.signoff ?? null;
if (signoffIndex != null) {
  vo[signoffIndex] = {
    src: spec.lines[signoffIndex],
    at: CARD_AT + 0.5,
    dur: +durs[signoffIndex].toFixed(2),
  };
}

const placed = vo.filter(Boolean).sort((a, b) => a.at - b.at);
for (let i = 1; i < placed.length; i++) {
  const prev = placed[i - 1];
  if (placed[i].at < prev.at + prev.dur) {
    problems.push(
      `narration overlaps itself: a line starts at ${placed[i].at.toFixed(1)}s while the previous runs to ${(prev.at + prev.dur).toFixed(1)}s`,
    );
  }
}
for (const line of placed) {
  const isSignoff = signoffIndex != null && line.src === spec.lines[signoffIndex];
  if (isSignoff) {
    if (line.at + line.dur > FORMAT.seconds) {
      problems.push(`the sign-off runs to ${(line.at + line.dur).toFixed(1)}s, past the end of the film`);
    }
    continue;
  }
  if (line.at + line.dur > CARD_AT + 0.05) {
    problems.push(`a line runs to ${(line.at + line.dur).toFixed(1)}s, past the end card at ${CARD_AT}`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  throw new Error(`${problems.length} problem(s) — not writing the film`);
}

const film = {
  n: spec.n,
  slug: spec.slug,
  title: spec.title,
  subtitle: spec.subtitle,
  clip: `${spec.clipDir}/clip.webm`,
  segments,
  vo: placed,
  spot,
};
fs.mkdirSync("src/films", { recursive: true });
fs.writeFileSync(`src/films/${spec.n}.json`, JSON.stringify(film, null, 2));

/* Regenerate the index Root.tsx reads, so building a film is all it takes to
   make it renderable. Hand-editing Root.tsx for every new film is a step
   people forget, and the film then silently does not exist. */
const built = fs.readdirSync("src/films")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
fs.writeFileSync(
  "src/films/index.ts",
  "/* Written by tools/build-film.mjs. Do not edit. */\n" +
    built.map((k, i) => `import f${i} from "./${k}.json";`).join("\n") +
    `\n\nexport const FILMS: any[] = [${built.map((_, i) => `f${i}`).join(", ")}];\n`,
);

const speech = placed.reduce((a, c) => a + c.dur, 0);
let worst = 0, prev = 0;
for (const c of placed) { worst = Math.max(worst, c.at - prev); prev = c.at + c.dur; }
console.log(
  `  film ${spec.n}: ${placed.length} lines, ${speech.toFixed(1)}s of speech over ${SCREEN}s,`,
  `longest silence ${worst.toFixed(1)}s, ${segments.length} segments, ${spot.length} spotlights`,
);
if (worst > 2.5) console.log(`  note: longest silence is ${worst.toFixed(1)}s, over the 2.5s the standard asks for`);
