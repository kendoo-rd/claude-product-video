/**
 * Locate the ffmpeg that Remotion ships.
 *
 * There is often no system ffmpeg, and npm puts the compositor package in
 * different places depending on how it hoists: sometimes at the top of
 * node_modules, sometimes nested under @remotion/renderer. Hard-coding either
 * one breaks the other. Find it instead.
 *
 * It also needs DYLD_LIBRARY_PATH pointing at its own directory or it cannot
 * load libavdevice, and it cannot encode PNG: ask it for jpg.
 */
import fs from "node:fs";
import path from "node:path";

function findDir() {
  const root = path.resolve("node_modules/@remotion");
  const direct = [
    "node_modules/@remotion/compositor-darwin-arm64",
    "node_modules/@remotion/compositor-darwin-x64",
    "node_modules/@remotion/compositor-linux-x64-gnu",
    "node_modules/@remotion/renderer/node_modules/@remotion/compositor-darwin-arm64",
  ];
  for (const c of direct) {
    const dir = path.resolve(c);
    if (fs.existsSync(path.join(dir, "ffmpeg"))) return dir;
  }
  /* Fall back to a shallow search rather than failing on a new layout. */
  if (fs.existsSync(root)) {
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      if (fs.existsSync(path.join(dir, "ffmpeg"))) return dir;
    }
  }
  throw new Error("could not find Remotion's ffmpeg; run npm install in video/");
}

export const FFMPEG_DIR = findDir();
export const FFMPEG_BIN = path.join(FFMPEG_DIR, "ffmpeg");
/** Ready to drop into a shell command. */
export const FF = `DYLD_LIBRARY_PATH=${FFMPEG_DIR} ${FFMPEG_BIN}`;
