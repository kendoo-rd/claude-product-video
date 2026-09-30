# video.config.json

Everything project-specific lives here. Nothing in `tools/` or `src/` hardcodes
a product name, a colour, or a duration.

## product

| Field | Meaning |
|---|---|
| `name` | Shown large on the end card. |
| `tagline` | The line under it. Set to `""` to omit. |
| `url` | Shown small under the tagline. Never read aloud. Set to `""` to omit. |

## brand

| Field | Meaning |
|---|---|
| `primary` | Background of the title and end cards. |
| `accent` | The series label, the tagline. |
| `spotlight` | The box drawn around the thing being named. Wants to be the highest-contrast colour you have against your app's chrome. |
| `screenBackground` | Behind the screen recording, and the colour the rest of the frame dims to. |
| `font` | A CSS font stack. A web font must be loaded by the composition; a system stack needs nothing. |
| `logo` | Path under `public/`, or `null`. Shown on the end card above the product name. |

## format

**These are the numbers the build enforces.** Getting them wrong does not
produce a wrong-looking film, it produces refusals.

| Field | Meaning |
|---|---|
| `seconds` | Total length. |
| `fps`, `width`, `height` | 30 / 1920 / 1080 unless you have a reason. |
| `titleEndsAt` | When the title card finishes and the recording starts. |
| `endCardAt` | When the recording stops and the end card begins. |
| `seriesLabel` | The word before the number on the title card: "Guide", "Chapter", "Part". |

`endCardAt - titleEndsAt` is the screen budget: how much recorded app the film
can hold. Everything else is derived from it.

**If you are using music, set `endCardAt` by listening.** Find the track's
final resolve and put the card there. That single alignment is most of what
makes a film feel cut to the music rather than laid over it. Without music,
pick whatever leaves the sign-off room to breathe.

## voice

Required. There is deliberately no fallback: a synthetic scratch read that
sounds "close enough" is how an unshippable film ships.

| Field | Meaning |
|---|---|
| `voiceId` | An ElevenLabs voice id. Use the same one for a whole series. |
| `model` | `eleven_multilingual_v2` unless you need otherwise. |
| `language` | ISO code passed to transcription, e.g. `eng`, `heb`. |
| `settings` | Passed straight through. Changing these changes the read, so change them before a series rather than during one. |

The key comes from `ELEVENLABS_API_KEY` or `~/.elevenlabs_key`.

## music

`null` for no music. Otherwise:

| Field | Meaning |
|---|---|
| `file` | Path under `public/`, e.g. `music/track.mp3`. |
| `openLevel` | Level in the gaps between lines. |
| `duckLevel` | Level under speech. |
| `finaleLevel` | Level after the last line, when there is no voice left to protect. |
| `ramp` | Seconds to fade between the two, either side of a line. |

Buy a licence that covers the use. Reusing a track across clients is a
licensing question, not a technical one.

## pacing

Rarely touched.

| Field | Meaning |
|---|---|
| `leadOut` | How long before its beat ends a line finishes. |
| `minGap` | Minimum silence between lines. Below this the build refuses. |
| `borrow` | How far a beat may reach before its hold began, for the frames where the cursor is gliding onto the same screen. |

## recorder

| Field | Meaning |
|---|---|
| `baseUrl` | Where the app is. Override per run with `RECORD_BASE`. |
| `auth` | `null`, or `{ path, email, password, emailSelector, passwordSelector, submitSelector, settleMs }`. Credentials can come from `RECORD_EMAIL` / `RECORD_PASSWORD` instead, which is better. |
| `cookies` | Set before the first paint. This is where you decline a consent banner so it stays out of the footage. |
| `cursor` | Colours for the drawn pointer. A real pointer is not captured by the recording. |
