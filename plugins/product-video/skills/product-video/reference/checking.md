# The check

A film is not finished because it built. Two passes minimum, and ship only when
a pass finds nothing.

```bash
node tools/transcribe.mjs out/film1.mp4 > /tmp/f1.json
node tools/verify-film.mjs 1 out/film1.mp4 out/1.srt
```

## What each tool is for

**`transcribe.mjs`** returns what the film **actually says** and when, from the
rendered audio. Read this rather than the script you wrote. It catches a line
that was regenerated but never replaced, and a clip longer than you assumed.

**`verify-film.mjs`** writes `out/verify-<n>.png`, a contact sheet with, per
line:

- three whole frames, at the line's start, midpoint and end
- the spotlight, cropped at native resolution
- for any line containing an action verb, a strip of eight samples across the
  line, and a measurement of how much of the spotlit region changes

It exits non-zero when an action line is static.

Each of those exists because the others missed something:

| Check | The defect it catches |
|---|---|
| Three frames | A mismatch that appears while the line is still being spoken. The midpoint alone hides it. |
| Native-resolution crop | The full frame is scaled to 420px, which turns a 48px button into ten pixels. A wrong button is invisible at that size. |
| Motion strip | Three stills cannot show a gesture. A film shipped the *result* of a drag with no drag in it. |

## The six questions

Look at every frame. Then answer, per line, **in writing**:

1. Is the thing the line names visible in all three frames?
2. Is the spotlight on that thing, and not on the whole page?
3. Would deleting this line lose the viewer anything?
4. Is the wording friendly, and free of dismissive phrasing?
5. Any em dash?
6. Does the line finish before its screen changes?

Any "no" is a defect. Fix it and run the whole check again.

Do not ship a film with a known defect and a note explaining it.

## Also confirm

- Total length matches `format.seconds`
- The end card begins at `format.endCardAt`
- Longest silence under about 2.5s (`build-film.mjs` prints it)
- No line runs past the card except the sign-off

## The loop

build → check → fix → build → check.

Two consecutive clean passes before shipping.

If the third iteration is still finding defects of the same kind, stop nudging
timings. The problem is upstream: either the recording does not contain the
screen the line needs, or the line is describing something the product does not
do in that order. Re-record or rewrite.

## Last step

Play it through once, watching. Levels and frames prove timing. Only watching
proves it is good.
