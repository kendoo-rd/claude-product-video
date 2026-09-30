# Product films

Scaffolded by the `product-video` skill. The skill holds the standard and the
working order; this directory holds the tooling.

```bash
npm install
# fill in video.config.json first, especially voice.voiceId

RECORD_OUT=public/1 node recorders/1.mjs        # record
node tools/tts.mjs 1                            # voice + captions
node tools/build-film.mjs specs/1.json          # timing
npx remotion render src/index.ts Film1 out/film1.mp4

node tools/transcribe.mjs out/film1.mp4 > /tmp/f1.json   # what it says
node tools/verify-film.mjs 1 out/film1.mp4 out/1.srt     # what it shows
node tools/encode.mjs 1                                  # -> out/<slug>/
```

## Layout

```
video.config.json   product, brand, format, voice, music, recorder
lines/<n>.json      the narration, one string per line
specs/<n>.json      which beats, which line on each, what to box
recorders/<n>.mjs   the shot list
public/<n>/         clip.webm and marks.json, written by the recorder
public/vo-<n>/      one mp3 per line, written by tts.mjs
src/films/<n>.json  the film config, written by build-film.mjs
out/                renders, captions, contact sheets, encoded output
```

Do not hand-edit `src/films/<n>.json` or `src/films/index.ts`. Both are
generated, and hand edits are lost on the next build.
