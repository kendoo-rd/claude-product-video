import React from "react";
import {
  AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence,
  interpolate, staticFile, useCurrentFrame,
} from "remotion";
import config from "../video.config.json";

/**
 * One film, cut to the format.
 *
 * Every film in a series is this component with a different config, so the
 * look lives here and each film is data. Nothing product-specific is hardcoded:
 * brand, product name, format and music all come from video.config.json.
 *
 * The spotlight is the part that makes a guide legible. A cursor dot on a full
 * desktop screenshot is invisible at playback size, so everything but the row,
 * card or field being named dims, and that one thing is boxed. No cropping and
 * no zooming, which is what makes an unwatchable film.
 */

const C = config as any;

export const FPS: number = C.format.fps;
export const FILM_SECONDS: number = C.format.seconds;
export const CARD_AT: number = C.format.endCardAt;
const TITLE_END: number = C.format.titleEndsAt;
const W: number = C.format.width;
const H: number = C.format.height;

const s = (sec: number) => Math.round(sec * FPS);
export const FILM_FRAMES = s(FILM_SECONDS);

const BRAND = C.brand;
const FONT: string = C.brand.font;
const SCREEN_BG: string = C.brand.screenBackground ?? "#0b1417";

/* Typed rather than read straight off the `any` config: with `any` levels the
   output range matches interpolate's tuple overload and it returns an array
   instead of a number, which type-checks as nonsense downstream. */
interface Music {
  file: string; openLevel: number; duckLevel: number; finaleLevel: number; ramp: number;
}
const MUSIC: Music | null = C.music ?? null;

export type Box = [number, number, number, number];
export interface Segment { at: number; len: number; from: number }
export interface VoLine { src: string; at: number; dur: number }
export interface Spot { from: number; to: number; box: Box }
export interface Film {
  n: number; slug: string; title: string; subtitle: string;
  clip: string; segments: Segment[]; vo: VoLine[]; spot: Spot[];
}

/* A produced track can sit louder than an arranged bed, but it still has to get
   out of the way of the read. Ducking sets the level under speech; the open
   level only ever applies in the gaps, so raising it makes the music present
   between lines without touching the headroom over the narration. Once the last
   line is done there is no voice left to protect. */
function bedVolume(frame: number, vo: VoLine[]): number {
  const m = MUSIC as Music;
  const t = frame / FPS;
  const lastOut = vo.length ? vo[vo.length - 1].at + vo[vo.length - 1].dur : 0;
  const open: number = interpolate(t, [lastOut, lastOut + 1.2], [m.openLevel, m.finaleLevel], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  let v: number = open;
  for (const c of vo) {
    const a = c.at - m.ramp;
    const b = c.at + c.dur + m.ramp;
    if (t < a || t > b) continue;
    let f = 1;
    if (t < c.at) f = (t - a) / m.ramp;
    else if (t > c.at + c.dur) f = (b - t) / m.ramp;
    v = Math.min(v, open + (m.duckLevel - open) * Math.max(0, Math.min(1, f)));
  }
  return v * interpolate(t, [0, 0.8], [0, 1], { extrapolateRight: "clamp" });
}

const Logo: React.FC<{ size: number }> = ({ size }) =>
  BRAND.logo ? (
    <img src={staticFile(BRAND.logo)} width={size} height={size} style={{ display: "block" }} alt="" />
  ) : null;

const TitleCard: React.FC<{ film: Film }> = ({ film }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const rise = interpolate(frame, [0, 20], [20, 0], {
    extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const out = interpolate(frame, [s(TITLE_END) - 9, s(TITLE_END)], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{
      backgroundColor: BRAND.primary, justifyContent: "center", alignItems: "center", opacity: out,
    }}>
      <div style={{ opacity: op, transform: `translateY(${rise}px)`, textAlign: "center" }}>
        <p style={{
          fontFamily: FONT, fontSize: 22, letterSpacing: ".18em", textTransform: "uppercase",
          color: BRAND.accent, margin: 0, fontWeight: 600,
        }}>
          {C.format.seriesLabel} {String(film.n).padStart(2, "0")}
        </p>
        <div style={{
          fontFamily: FONT, fontSize: 74, fontWeight: 700, color: "#fff",
          letterSpacing: "-0.03em", marginTop: 18, lineHeight: 1.1,
        }}>{film.title}</div>
        <div style={{ fontFamily: FONT, fontSize: 28, color: "rgba(255,255,255,.8)", marginTop: 18 }}>
          {film.subtitle}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Clip: React.FC<{ src: string; dur: number; from: number }> = ({ src, dur, from }) => {
  const frame = useCurrentFrame();
  const n = s(dur);
  const op = Math.min(
    interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [n - 8, n], [1, 0], { extrapolateLeft: "clamp" }),
  );
  return (
    <AbsoluteFill style={{ opacity: op, backgroundColor: SCREEN_BG }}>
      <OffthreadVideo
        src={staticFile(src)}
        trimBefore={Math.round(from * FPS)}
        style={{ width: "100%", height: "100%", objectFit: "fill" }}
      />
    </AbsoluteFill>
  );
};

const Spotlight: React.FC<{ spot: Spot[] }> = ({ spot }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cur = spot.find((h) => t >= h.from - 0.35 && t <= h.to + 0.3);
  if (!cur) return null;
  const [x, y, w, h] = cur.box;
  const op = Math.min(
    interpolate(t, [cur.from - 0.35, cur.from + 0.05], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(t, [cur.to, cur.to + 0.3], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const grow = interpolate(t, [cur.from - 0.35, cur.from + 0.15], [7, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const X = x - grow, Y = y - grow, BW = w + grow * 2, BH = h + grow * 2;
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <mask id="cut">
            <rect width={W} height={H} fill="#fff" />
            <rect x={X} y={Y} width={BW} height={BH} rx={10} fill="#000" />
          </mask>
        </defs>
        <rect width={W} height={H} fill={SCREEN_BG} opacity={0.34} mask="url(#cut)" />
        <rect x={X} y={Y} width={BW} height={BH} rx={10} fill="none" stroke={BRAND.spotlight} strokeWidth={3} />
        <rect x={X - 3} y={Y - 3} width={BW + 6} height={BH + 6} rx={13}
              fill="none" stroke={BRAND.spotlight} strokeWidth={6} opacity={0.22} />
      </svg>
    </AbsoluteFill>
  );
};

/** Arrives on the musical resolve, if there is music. */
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const pop = interpolate(frame, [0, 16], [0.88, 1], {
    extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.4)),
  });
  const rise = interpolate(frame, [0, 18], [18, 0], {
    extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.primary, justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: op, textAlign: "center" }}>
        {BRAND.logo ? <div style={{ transform: `scale(${pop})` }}><Logo size={96} /></div> : null}
        <div style={{
          fontFamily: FONT, fontSize: 68, fontWeight: 700, color: "#fff",
          letterSpacing: "-0.03em", marginTop: 22, transform: `translateY(${rise}px)`,
        }}>{C.product.name}</div>
        {C.product.tagline ? (
          <div style={{
            fontFamily: FONT, fontSize: 32, color: BRAND.accent, marginTop: 14,
            fontWeight: 600, transform: `translateY(${rise}px)`,
          }}>{C.product.tagline}</div>
        ) : null}
        {C.product.url ? (
          <div style={{
            fontFamily: FONT, fontSize: 24, color: "rgba(255,255,255,.72)", marginTop: 26,
            transform: `translateY(${rise}px)`,
          }}>{C.product.url}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const ProductFilm: React.FC<{ film: Film }> = ({ film }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: SCREEN_BG }}>
      {MUSIC ? (
        <Audio src={staticFile(MUSIC.file)} volume={() => bedVolume(frame, film.vo)} />
      ) : null}
      {film.vo.map((c, i) => (
        <Sequence key={i} from={s(c.at)} name={`vo${i + 1}`}>
          <Audio src={staticFile(c.src)} />
        </Sequence>
      ))}
      <Sequence durationInFrames={s(TITLE_END)} name="title">
        <TitleCard film={film} />
      </Sequence>
      {film.segments.map((g, i) => (
        <Sequence key={i} from={s(g.at)} durationInFrames={s(g.len)} name={`clip${i + 1}`}>
          <Clip src={film.clip} dur={g.len} from={g.from} />
        </Sequence>
      ))}
      <Sequence durationInFrames={s(CARD_AT)} name="spot">
        <Spotlight spot={film.spot} />
      </Sequence>
      <Sequence from={s(CARD_AT)} durationInFrames={s(FILM_SECONDS - CARD_AT)} name="end">
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
