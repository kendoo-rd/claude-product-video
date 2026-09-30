# product-video

A Claude Code plugin for building narrated product guide videos to a fixed
quality standard.

It carries both halves of the job: the **standard** (how a line is written, what
gets boxed, what has to be true before a film ships) and the **pipeline** that
enforces it (ElevenLabs voice, screen recording with element spotlights,
music, captions, and a check pass that refuses a film whose narration does not
match what is on screen).

## Install

This repo is a marketplace containing one plugin. It is **local and private**:
adding it points Claude Code at this folder on your machine. Nothing is
published, and nobody else can find it unless you push the repo and give them
the URL.

```bash
/plugin marketplace add /path/to/claude-product-video
/plugin install product-video@kendoo
```

To share it, push this repo to GitHub and have people run:

```bash
/plugin marketplace add <owner>/<repo>
/plugin install product-video@kendoo
```

## Use

In any project, ask for a guide video. The skill scaffolds a `video/`
workspace on first run:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/product-video/install.mjs" video
cd video && npm install
```

Then fill in `video.config.json` and work the pipeline:

```bash
RECORD_OUT=public/1 node recorders/1.mjs        # record the app
node tools/tts.mjs 1                            # voice + captions
node tools/build-film.mjs specs/1.json          # timing
npx remotion render src/index.ts Film1 out/film1.mp4

node tools/transcribe.mjs out/film1.mp4 > /tmp/f1.json   # what it says
node tools/verify-film.mjs 1 out/film1.mp4 out/1.srt     # what it shows
node tools/encode.mjs 1                                  # -> out/<slug>/
```

## Requirements

- Node 20+
- An ElevenLabs API key in `ELEVENLABS_API_KEY` or `~/.elevenlabs_key`.
  **There is no fallback voice.** A synthetic scratch read that sounds "close
  enough" is how an unshippable film gets shipped.
- A music track is optional. If you use one, licence it for the use.

## What it refuses to do

These are the point of the thing. Every one exists because that exact defect
shipped a film.

- Narration that overlaps itself
- A line running past the end card, except the sign-off
- A beat longer than the shot was actually held for
- A spotlight aimed outside the frame, which draws nothing and renders fine
- More narration than there is screen time
- An em dash, in a line or a caption
- Captions whose count disagrees with the narration
- A line claiming an action over a region that never changes

## Layout

```
.claude-plugin/marketplace.json      makes this repo a marketplace
plugins/product-video/
  .claude-plugin/plugin.json
  skills/product-video/
    SKILL.md            the standard and the working order
    install.mjs         scaffolds video/ into a project
    reference/
      config.md         every field in video.config.json
      recording.md      writing a recorder, and the traps
      checking.md       the check protocol
    scaffold/           copied into the target project
      video.config.json product, brand, format, voice, music, recorder
      src/Film.tsx      the film: title card, clip, spotlight, end card
      tools/            tts, build-film, verify-film, transcribe, encode
      recorders/rec.mjs the recording harness
```

Generalised from a real product guide series, where the refusal list was earned.
