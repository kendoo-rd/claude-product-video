# product-video

Build narrated product guide videos to a fixed quality standard.

The plugin carries both halves of the job: the **standard** (how a line is
written, what gets boxed, what has to be true before a film ships) and the
**pipeline** that enforces it.

## What you get

One skill, `product-video`, which scaffolds a self-contained `video/` workspace
into any project and then drives it:

```
record  →  narrate  →  build  →  check  →  fix  →  check  →  ship
```

- **Voice** — ElevenLabs, one voice per series, generated per line so the
  captions can never drift from what is spoken.
- **Recording** — a Playwright harness that draws a cursor, marks each shot's
  start and end, and captures the on-screen rectangle of whatever the narration
  is about to name.
- **Spotlights** — the rest of the screen dims and the named element is boxed.
  A cursor dot on a 1920x1080 screenshot is invisible at playback size.
- **Music** — optional, ducked under the read and opened up in the gaps.
- **Captions** — cue times come from the film config, so they cannot disagree
  with the audio.
- **A check pass** that gates shipping.

## What it refuses to do

This is the point of it. Every refusal exists because that exact defect shipped
a film.

| Refusal | The defect |
|---|---|
| Narration overlapping itself | Two lines talking over each other |
| A line past the end card | Narration continuing over the outro |
| A beat longer than the shot was held | Narration describing a screen that has already moved on |
| A spotlight outside the frame | Renders fine, highlights nothing, invisible until someone looks |
| More narration than screen time | A film that cannot fit what it promises |
| An em dash | Changes the read, and the caption encoder rejects it |
| Caption count disagreeing with the audio | Subtitles drifting off the voice |
| An action verb over a static region | "Drag the card to a new column" over a screen where nothing moves |

The last one is measured, not assumed: for any line containing an action verb,
the check samples the spotlit region across the line and reports how much of it
actually changes.

## Requirements

- Node 20+
- An ElevenLabs API key in `ELEVENLABS_API_KEY` or `~/.elevenlabs_key`.
  **There is no fallback voice.** A synthetic scratch read that sounds "close
  enough" is how an unshippable film gets shipped.
- A music track is optional. If you use one, licence it for the use.

Nothing else is assumed. Product name, brand colours, film length, end-card
timing, voice and music all live in `video.config.json`.

## Use

Ask for a guide video in any project. The skill scaffolds the workspace on
first run, or:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/product-video/install.mjs" video
cd video && npm install
```

Then fill in `video.config.json` and work the pipeline. `skills/product-video/reference/`
documents every config field, how to write a recorder, and the check protocol.

## Where it stops

At a verified file: an h264 mp4 with faststart, a poster frame and a WebVTT
caption track in `out/<slug>/`. Deployment is the project's business.

Generalised from a real product guide series, where the refusal list
was earned one shipped defect at a time.
