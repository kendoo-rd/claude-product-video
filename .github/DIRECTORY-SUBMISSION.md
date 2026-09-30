# Submitting product-video to the official Claude Code plugin directory

**This is not a pull request.** `anthropics/claude-plugins-official` says
external plugins are submitted through a form and reviewed against quality and
security standards:

> Third-party partners can submit plugins for inclusion in the marketplace.
> External plugins must meet quality and security standards for approval. To
> submit a new plugin, use the plugin directory submission form.

Form: **https://clau.de/plugin-directory-submission**

Only the repo owner should submit it. Everything the form is likely to ask for
is below.

## Values to paste

| Field | Value |
|---|---|
| Plugin name (slug, immutable) | `product-video` |
| Repository | `https://github.com/kendoo-rd/claude-product-video` |
| Homepage | `https://github.com/kendoo-rd/claude-product-video` |
| Author | Kendoo |
| Contact | rnd@kendoo.co |
| Category | productivity |
| Licence | MIT |
| Visibility | Public |

**Description** (as it appears in `plugin.json`):

> Build narrated product guide videos to a fixed quality standard: ElevenLabs
> voiceover, screen recording with element spotlights, captions, and a check
> pass that refuses to ship a film whose narration does not match what is on
> screen.

## The marketplace entry a reviewer would add

The plugin lives in a subdirectory, so `git-subdir` is the right source form.

```json
{
  "name": "product-video",
  "description": "Build narrated product guide videos to a fixed quality standard: ElevenLabs voiceover, screen recording with element spotlights, captions, and a check pass that refuses to ship a film whose narration does not match what is on screen.",
  "author": { "name": "Kendoo" },
  "category": "productivity",
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/kendoo-rd/claude-product-video.git",
    "path": "plugins/product-video",
    "ref": "main"
  },
  "homepage": "https://github.com/kendoo-rd/claude-product-video"
}
```

Tag a release and pin `ref` to the tag if they ask for a pinned version.

## What a reviewer will want to know

**What it does.** One skill that scaffolds a self-contained `video/` workspace
into a project and drives the whole pipeline: record the app, generate the
narration, time the film, render, check, encode.

**Network calls.** Two, both to ElevenLabs, both requiring the user's own key:
text-to-speech to generate the narration, and speech-to-text to transcribe the
finished film for auditing. Nothing else leaves the machine. No telemetry.

**Credentials.** Read from `ELEVENLABS_API_KEY` or `~/.elevenlabs_key`. Never
written, logged or transmitted anywhere except to ElevenLabs.

**What it executes.** Node scripts in the scaffolded workspace, Remotion for
rendering, and Playwright for recording and frame analysis. It drives a browser
against a URL the user configures. It does not run anything it did not
scaffold.

**What it writes.** Only inside the scaffolded `video/` directory, plus
`/tmp/pv-verify` for intermediate frames. The scaffolder never overwrites an
existing file.

**No MCP servers, no hooks, no agents.** One skill and its bundled tooling.

**Third-party services.** ElevenLabs, with the user's own account. Music is
optional and user-supplied; the plugin ships no audio.

## Before submitting

- [x] `LICENSE` at the repo root
- [x] `README.md` at the repo root and inside the plugin directory
- [x] `.claude-plugin/plugin.json` with name, description, author, homepage
- [x] Skill frontmatter name matches its directory
- [x] No credentials or secrets in the repo
- [ ] Install it yourself from GitHub and run one film end to end, so the
      submission is backed by a film that actually shipped
