# Writing a recorder

A recorder is a shot list. All the browser setup lives in `recorders/rec.mjs`.

```bash
RECORD_OUT=public/1 node recorders/1.mjs
```

It writes `public/1/clip.webm` and `public/1/marks.json`.

## The three calls

**`hold(name, seconds)`** — rest on a screen. Emits `name.in` before the pause
and `name.out` after, so the build knows exactly where the shot began. A beat
in the spec refers to `name`.

**`grab(label, fn)`** — record the on-screen rectangle of the thing the
narration is about to name. `fn` runs in the page and returns
`{x, y, width, height}` or `null`.

**`mark(name)`** — a bare mark. Use `name.in` / `name.out` by hand when the
beat has to be bracketed around a gesture rather than a pause.

## The two rules that cost rebuilds

**Box the thing before you change it.**

A guide shipped narrating "the plus button" over a button that had already
turned into a close X, because `grab` ran after the click that opened the menu.
Grab first, then interact.

```js
await grab("menu.button", () => { /* ... */ });  // while it is still a plus
await hold("menu", 12);
await openTheMenu();                             // now it becomes an X
```

**Dwell first, act last.**

`build-film.mjs` places a line so it *finishes* just before its beat does. An
action performed at the start of a beat is over before the narration plays. A
guide shipped five seconds of an already-open dialog for a line about dragging.

```js
mark("drag.in");
await page.waitForTimeout(2600);        // dwell
await glide(x, y, 1200);                // then move
for (let i = 1; i <= 60; i++) {         // then the gesture, slowly enough to read
  await page.mouse.move(x, y + i * 2.2);
  await page.waitForTimeout(80);
}
mark("drag.out");
```

Slowly enough to read matters twice: the viewer has to see it, and
`verify-film.mjs` measures whether the spotlit region actually changed.

## Assert what you write

A click that lands without taking effect leaves the narration describing a
screen that never happened. Check, and throw.

```js
await save.click({ force: true });
await page.waitForTimeout(4000);
if (await page.getByRole("dialog").isVisible().catch(() => false)) {
  throw new Error("the dialog did not close");
}
```

## Traps

- **Wait for the thing, not for a duration.** A fixed pause that was enough
  once stops being enough. `await page.waitForSelector(...)` instead.
- **Dialog overlays block `locator.click()`** because they report as
  intercepting pointer events. `clickRaw()` drives the mouse directly.
- **Do not start a gesture on top of an existing element** if that opens it.
  Find empty space first.
- **Record more than the film needs.** `finish()` warns when the recording is
  shorter than the screen budget.
- **Clean up.** A recorder that creates data leaves it behind. Delete it after
  encoding, or record against a demo account you can reset.

## Re-recording

`finish()` renames the raw capture to `clip.webm` and deletes the stray
`page@<hash>.webm` files Playwright leaves. Without that a re-record produces
new marks against the *old* footage, which is silent and cost three rebuild
cycles before it was fixed. If you ever bypass `finish()`, do that renaming
yourself.
