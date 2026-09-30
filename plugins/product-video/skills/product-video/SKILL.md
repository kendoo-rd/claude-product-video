---
name: product-video
description: Build a narrated product guide video to a fixed quality standard. Use when the user asks for a guide video, product walkthrough, demo film, feature tour, onboarding video, or wants to add narration, captions, or a voiceover to a screen recording. Covers the whole pipeline: writing the narration, recording the app, ElevenLabs voice, music, spotlights, captions, and the check pass that gates shipping.
---

# Product guide videos

One standard, whatever the product. A viewer should be able to watch any two
films in a series back to back and not notice they were made at different
times, or by different people.

Work in this order and do not skip the check:

**configure → record → write → build → check → fix → check again → ship**

At least two check passes. Ship only when a pass finds nothing.

## The one rule everything else serves

**Never say something the viewer cannot see on screen at that moment.**

This is the defect that ships. It is not small: the viewer looks for what you
just named, does not find it, and concludes the product is confusing. Before
writing any line, know which recorded beat it plays over and what is visible
in that beat.

If a line needs a screen that was not recorded, you have two honest options:
record it, or cut the line. Never leave the line in and hope.

## First run in a project

If there is no `video/` directory, scaffold one:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/product-video/install.mjs" <target-dir>
cd <target-dir> && npm install
```

Then fill in `video/video.config.json`. Read `reference/config.md` for what
every field means. Two are required before anything will render:

- `voice.voiceId` and an ElevenLabs API key (`ELEVENLABS_API_KEY`, or
  `~/.elevenlabs_key`). **There is no fallback voice.** A synthetic scratch
  read is how an unshippable film gets shipped, so the pipeline refuses to
  build without the real one.
- `format.seconds` and `format.endCardAt`. If you are using music, listen to
  the track and set `endCardAt` to its final resolve. The end card landing on
  the resolve is what makes the film feel cut to the music rather than laid
  over it. Music is optional; the format is not.

## Recording

`recorders/rec.mjs` is the shared harness. A recorder script is only its shot
list. Read `reference/recording.md` before writing one.

The three things it gives you, and why each exists:

| Call | What it does |
|---|---|
| `hold(name, seconds)` | Emits `name.in` before the dwell and `name.out` after, so the build never has to infer where a shot began. |
| `grab(label, fn)` | Records the on-screen rectangle of the thing the narration is about to name, **at the moment it is on screen**. |
| `mark(name)` | A bare mark, for a beat you bracket by hand around a gesture. |

Two rules that cost real rebuilds:

- **Box the thing before you change it.** A guide shipped narrating "the plus
  button" over a button that had already turned into a close X, because the
  box was grabbed after the click.
- **Dwell first, act last.** The build places a line so it *finishes* just
  before its beat does. An action performed at the start of a beat is over
  before the narration plays. Wait inside the beat, then perform the gesture at
  the end of it.

## Writing the narration

Every line must pass all six.

**1. It teaches something the viewer can act on.**
Delete the line and ask what the viewer lost. If the answer is "nothing", it
does not go in. Marketing reassurance is not teaching.

- ✗ "It works on every device." The viewer cannot do anything with this.
- ✗ "And you can change the colours whenever you want." True, but not this film's job.
- ✓ "Pick a template to start your first project."

**2. It is friendly and practical.** Write as if sitting next to the person.
Say what they do, in the words the screen uses. Second person, active voice,
present tense.

**3. It never dismisses what the viewer might need.** Some viewers came *for*
the thing you are calling optional.

- ✗ "Reports and settings can wait." Tells them their need is unimportant.
- ✓ "You can skip reports and settings for now."

Avoid: "can wait", "don't worry about", "that's not important", "you probably
don't need". Say "you can skip this for now" or "we cover that in guide N".

**4. One idea, one sentence, one audio file.** Never split a sentence across
two clips. The gap between clips is audible and turns one thought into two
broken halves.

**5. No em dashes.** They change how the voice paces the line, and the encoder
rejects them in captions outright. `tts.mjs` refuses one. Use a comma, a full
stop, or a colon.

**6. It names what is on screen using the screen's own words.** If the button
says "Save", the line says "save", not "store the record".

Numbers are written the way they are spoken: "Ten items per page", not "10
items per page". Never read out a URL.

### Shape

| Position | Job | Length |
|---|---|---|
| Opener, over the title card | What the viewer will have at the end, and how long it takes | ~3s |
| One line per beat | One screen, one idea | ~3 to 4s each |
| Sign-off, over the end card | What the next film covers | ~4s |

The opener is the only line allowed to promise. The sign-off is the only line
allowed to point outside this film, and the only one allowed to run past the
end card.

## Building

```bash
cd video
node tools/tts.mjs <n>              # lines/<n>.json -> voice + out/<n>.srt
node tools/build-film.mjs specs/<n>.json
npx remotion render src/index.ts Film<n> out/film<n>.mp4
```

`build-film.mjs` refuses to emit a film that:

- has narration overlapping itself
- has a line running past the end card (except the sign-off)
- needs a beat longer than it was actually held for
- points a spotlight at a box outside the frame
- has more narration than there is screen time

**Those refusals are correct. Fix the input, never loosen the rule.** Every one
of them exists because that exact defect shipped.

## The check, which is not optional

A film is not finished because it built. Two passes minimum.

```bash
node tools/transcribe.mjs out/film<n>.mp4 > /tmp/f<n>.json
node tools/verify-film.mjs <n> out/film<n>.mp4 out/<n>.srt
```

`transcribe.mjs` returns what the film **actually says** and when. Read that
rather than the script you wrote: it catches a line that was regenerated but
not replaced, and a clip longer than you assumed.

`verify-film.mjs` produces a contact sheet with, per line, three whole frames
(start, middle, end), the spotlight cropped at native resolution, and for any
line containing an action verb, a motion strip measuring whether the spotlit
region actually changes. It exits non-zero when an action line is static.

Each of those three catches what the others cannot:

- The midpoint alone hides a mismatch that appears while the line is still
  being spoken. Hence three frames.
- The full frame is scaled to 420px, which turns a 48px button into ten
  pixels. Hence the native-resolution crop.
- Three stills cannot show a gesture. A film once shipped the *result* of a
  drag with no drag in it. Hence the motion check.

**Look at every frame.** Then answer, per line, in writing:

1. Is the thing the line names visible in all three frames?
2. Is the spotlight on that thing, and not on the whole page?
3. Would deleting this line lose the viewer anything?
4. Is the wording friendly, and free of dismissive phrasing?
5. Any em dash?
6. Does the line finish before its screen changes?

Any "no" is a defect. Fix it and run the whole check again. Do not ship a film
with a known defect and a note explaining it.

Also confirm: total length matches `format.seconds`, the end card begins at
`format.endCardAt`, the longest silence is under about 2.5s, and no line runs
past the card except the sign-off.

### The loop

Repeat build → check → fix until a check pass finds nothing. Two consecutive
clean passes before shipping. If the third iteration is still finding defects
of the same kind, the problem is the recording or the script, not the build:
go back and re-record or rewrite rather than nudging timings.

## Shipping

Only after a clean pass:

```bash
node tools/encode.mjs <n>
```

Writes an h264 mp4 with faststart, a poster frame, and `captions.vtt` whose
cue times come from the film config, into `out/<slug>/`. It refuses if the
caption count disagrees with the line count, or if any caption contains an em
dash.

That is where this skill stops. Deployment is the project's business: take the
files from `out/<slug>/` and publish them however that project publishes.

Then load the page and play it through once. Levels and frames prove timing;
only watching proves it is good.

## When the user reports a problem

Do not defend the film and do not explain the pipeline. Find the defect,
confirm it against the actual film with `transcribe.mjs` and `verify-film.mjs`,
fix it, re-check. Report what was wrong in one or two sentences.

## Reference

- `reference/config.md` — every field in `video.config.json`
- `reference/recording.md` — writing a recorder, and the traps
- `reference/checking.md` — the check protocol in full
