#!/usr/bin/env node
//
// generate-audio.mjs
//
// Re-render the 24 name pronunciation .m4a files shipped in People/audio/
// using Kokoro-82M TTS (af_heart voice). Quality is much better than macOS
// `say`, and because we ship pre-rendered bytes, voice consistency is
// guaranteed across all participant machines.
//
// USAGE
//   1. This script intentionally does NOT use the project's package.json.
//      Set up a one-off temp install of kokoro-js outside the repo:
//
//        mkdir -p /tmp/kokoro-render
//        cd /tmp/kokoro-render
//        npm init -y
//        npm pkg set type=module
//        npm install kokoro-js
//
//   2. From that temp directory, run this script directly:
//
//        node /Users/grantsherman/Documents/GitHub/HFEstudy/scripts/generate-audio.mjs
//
//      (It resolves `kokoro-js` from the cwd's node_modules, so it must be
//      run from a directory where `kokoro-js` is installed.)
//
//   3. The script reads names from People/PFP/*.png, renders one .wav per
//      name with Kokoro-82M (voice af_heart, dtype q8), converts each to
//      AAC .m4a via Apple's `afconvert`, and writes them into People/audio/.
//
// REQUIREMENTS
//   - macOS (uses `afconvert` for WAV->M4A AAC conversion)
//   - Node.js 18+ (tested on Node 22, Apple Silicon)
//   - First run downloads ~85MB Kokoro-82M ONNX model from HuggingFace into
//     the kokoro-js cache (under the cwd's node_modules). Subsequent runs
//     are fast.
//
// VOICE / FORMAT
//   - Voice: af_heart (clean female English, Kokoro default)
//   - Sample rate: 24000 Hz mono (Kokoro-82M default)
//   - Output: AAC in .m4a container, default afconvert bitrate
//

import { KokoroTTS } from "kokoro-js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

// Anchor paths to the repo root regardless of cwd, by walking up from this
// file's location (scripts/generate-audio.mjs -> repo root).
const __filename = new URL(import.meta.url).pathname;
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");
const PFP_DIR = path.join(REPO_ROOT, "People", "PFP");
const OUT_DIR = path.join(REPO_ROOT, "People", "audio");
const TMP_DIR = path.join(os.tmpdir(), "kokoro-render-wav");

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart";

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const names = fs
  .readdirSync(PFP_DIR)
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .map((f) => f.replace(/\.png$/i, ""))
  .sort();

console.log(`Found ${names.length} names:`, names.join(", "));

console.log(`Loading Kokoro model (${MODEL_ID}) ...`);
const t0 = Date.now();
const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8" });
console.log(`Model loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

for (const name of names) {
  const wavPath = path.join(TMP_DIR, `${name}.wav`);
  const m4aPath = path.join(OUT_DIR, `${name}.m4a`);

  const t1 = Date.now();
  const audio = await tts.generate(name, { voice: VOICE });
  await audio.save(wavPath);
  const wavMs = Date.now() - t1;

  const t2 = Date.now();
  execFileSync("afconvert", ["-f", "mp4f", "-d", "aac", wavPath, m4aPath], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const convMs = Date.now() - t2;
  const m4aSize = fs.statSync(m4aPath).size;

  console.log(
    `  ${name.padEnd(10)}  tts ${wavMs}ms  conv ${convMs}ms  ${m4aSize} bytes`
  );
}

console.log("Done.");
