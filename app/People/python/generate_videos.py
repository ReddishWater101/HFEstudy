#!/usr/bin/env python3
"""Generate intro videos for each person in People/PFP using xAI's grok-imagine-video.

Each person is locked to a unique (environment, activity) pair stored in
scene_assignments.json. The manifest is auto-extended for any people who don't
yet have an assignment, drawing from the SCENE_CATALOG and never repeating.

Usage:
    python -u generate_videos.py --test               # one random unassigned/missing person
    python -u generate_videos.py --person Aaron       # one specific person
    python -u generate_videos.py                       # every person (skips existing videos)
    python -u generate_videos.py --force               # regenerate everything
"""
import argparse
import base64
import json
import os
import random
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# --- Paths ---
SCRIPT_DIR = Path(__file__).resolve().parent
PEOPLE_DIR = SCRIPT_DIR.parent
PFP_DIR = PEOPLE_DIR / "PFP"
VIDEOS_DIR = PEOPLE_DIR / "videos"
MANIFEST_PATH = SCRIPT_DIR / "scene_assignments.json"

# --- API config ---
API_BASE = "https://api.x.ai/v1"
MODEL = "grok-imagine-video"
DURATION = 10
RESOLUTION = "720p"
POLL_INTERVAL_SEC = 5
POLL_TIMEOUT_SEC = 600


class FatalAPIError(Exception):
    """Stop the whole batch — credits exhausted, auth bad, etc."""


# --- Scene catalog: 28 unique (environment, activity) pairs ---
SCENE_CATALOG = [
    ("a cozy coffee shop", "holding a warm latte"),
    ("a modern open-plan office", "standing beside a desk with a closed laptop under one arm"),
    ("a bright school classroom", "leaning against a desk with a textbook in hand"),
    ("a busy gym", "wiping their forehead with a small towel"),
    ("a sunny city park", "standing near a bench with sunglasses pushed up on their head"),
    ("a grocery store aisle", "holding a small shopping basket"),
    ("a rooftop bar at golden hour", "holding a casual drink"),
    ("a lively farmers market", "holding a paper bag of fresh produce"),
    ("a neighborhood bookstore", "browsing a shelf of paperbacks"),
    ("a small art gallery", "standing in front of a colorful painting"),
    ("a sandy beach boardwalk", "with ocean waves rolling behind them"),
    ("a hotel lobby", "with a small rolling suitcase beside them"),
    ("a tech conference floor", "wearing a lanyard with a name badge"),
    ("a sunlit yoga studio", "rolling up a yoga mat"),
    ("a casual restaurant", "looking up from a menu"),
    ("an airport terminal near a tall window", "with a backpack over one shoulder"),
    ("a college campus quad", "carrying a small stack of books"),
    ("a craft brewery taproom", "holding a tasting flight of beers"),
    ("a botanical garden greenhouse", "standing near tropical plants"),
    ("a city bus stop", "waiting on a bench with a backpack at their feet"),
    ("a vintage record store", "flipping through vinyl records in a wooden bin"),
    ("a board game cafe", "shuffling a deck of cards at a wooden table"),
    ("an outdoor food truck plaza", "holding a paper food container"),
    ("a small flower shop", "arranging stems in a colorful bouquet"),
    ("a vintage thrift store", "holding a hanger with a denim jacket"),
    ("a movie theater lobby", "holding a large bag of popcorn"),
    ("a hardware store aisle", "examining a tool from the shelf"),
    ("a hotel rooftop pool deck", "wrapped in a hotel towel"),
]


def encode_image_data_uri(path: Path) -> str:
    suffix = path.suffix.lower()
    mime = "image/png" if suffix == ".png" else "image/jpeg"
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text())
    return {}


def save_manifest(manifest: dict) -> None:
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


def ensure_assignments(manifest: dict, all_names: list[str]) -> dict:
    """Make sure every person has a unique (environment, activity) pair.

    Mutates+returns manifest. Persists if anything changed.
    """
    used = {(v["environment"], v["activity"]) for v in manifest.values()}
    available = [pair for pair in SCENE_CATALOG if pair not in used]

    missing = [n for n in all_names if n not in manifest]
    if not missing:
        return manifest

    if len(missing) > len(available):
        raise RuntimeError(
            f"Need {len(missing)} more unique scenes but only {len(available)} "
            f"are unused in SCENE_CATALOG. Add more entries to SCENE_CATALOG."
        )

    # Deterministic-ish: shuffle with a fixed seed so re-running gives the same
    # assignment for the same set of missing people.
    rng = random.Random(20260407)
    rng.shuffle(available)
    rng.shuffle(missing)

    for name, (env, act) in zip(missing, available):
        manifest[name] = {"environment": env, "activity": act}

    save_manifest(manifest)
    return manifest


def build_prompt(name: str, environment: str, activity: str) -> str:
    return (
        f"Setting: {environment}. The environment is fully visible in the background "
        f"throughout the entire shot and never changes. "
        f"A person stands in this setting, {activity}. "
        f"The person's face, hair, skin tone, and overall appearance match <IMAGE_1> exactly. "
        f"IMPORTANT: <IMAGE_1> is used ONLY as a reference for the person's appearance — "
        f"do NOT use the background, lighting, or environment from <IMAGE_1>. "
        f"The scene stays in {environment} from the first frame to the last frame. "
        f"The camera is static, single continuous shot, no scene transitions, no morphing, no cuts. "
        f"The person turns toward the camera, smiles warmly, and says clearly in a friendly voice: "
        f"\"Hey, my name is {name}.\" "
        f"Natural lighting, candid casual moment, realistic."
    )


def submit_generation(api_key: str, prompt: str, image_data_uri: str) -> str:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = {
        "model": MODEL,
        "prompt": prompt,
        "reference_images": [{"url": image_data_uri}],
        "duration": DURATION,
        "resolution": RESOLUTION,
    }
    r = requests.post(f"{API_BASE}/videos/generations", headers=headers, json=body, timeout=60)
    if r.status_code in (401, 402, 403, 429):
        raise FatalAPIError(f"submit returned {r.status_code}: {r.text}")
    if not r.ok:
        raise RuntimeError(f"submit failed ({r.status_code}): {r.text}")
    payload = r.json()
    request_id = payload.get("request_id") or payload.get("id")
    if not request_id:
        raise RuntimeError(f"no request_id in response: {payload}")
    return request_id


def poll_until_done(api_key: str, request_id: str, label: str) -> str:
    headers = {"Authorization": f"Bearer {api_key}"}
    deadline = time.time() + POLL_TIMEOUT_SEC
    last_status = None
    while time.time() < deadline:
        time.sleep(POLL_INTERVAL_SEC)
        pr = requests.get(f"{API_BASE}/videos/{request_id}", headers=headers, timeout=30)
        if not pr.ok:
            print(f"[{label}] poll error {pr.status_code}: {pr.text}", flush=True)
            continue
        data = pr.json()
        status = data.get("status", "unknown")
        if status != last_status:
            print(f"[{label}] status={status}", flush=True)
            last_status = status
        if status in ("done", "completed", "succeeded"):
            video = data.get("video") or {}
            url = video.get("url") or data.get("url")
            if not url:
                raise RuntimeError(f"completed but no url: {data}")
            return url
        if status in ("failed", "error"):
            raise RuntimeError(f"generation failed: {data}")
    raise RuntimeError(f"timed out waiting for {request_id}")


def download(url: str, out_path: Path) -> None:
    vr = requests.get(url, timeout=300, stream=True)
    vr.raise_for_status()
    with out_path.open("wb") as f:
        for chunk in vr.iter_content(chunk_size=1024 * 64):
            if chunk:
                f.write(chunk)


def generate_for_person(api_key: str, pfp_path: Path, out_path: Path, scene: dict) -> None:
    name = pfp_path.stem
    environment = scene["environment"]
    activity = scene["activity"]
    prompt = build_prompt(name, environment, activity)
    print(f"[{name}] scene: {environment} | activity: {activity}", flush=True)
    print(f"[{name}] submitting...", flush=True)
    request_id = submit_generation(api_key, prompt, encode_image_data_uri(pfp_path))
    print(f"[{name}] request_id={request_id}", flush=True)
    url = poll_until_done(api_key, request_id, name)
    print(f"[{name}] downloading -> {out_path}", flush=True)
    download(url, out_path)
    print(f"[{name}] done ({out_path.stat().st_size // 1024} KB)", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate intro videos via xAI Grok Imagine.")
    parser.add_argument("--test", action="store_true", help="pick one random missing person and exit")
    parser.add_argument("--person", help="generate a specific person by first name (e.g. Aaron)")
    parser.add_argument("--force", action="store_true", help="overwrite existing videos")
    args = parser.parse_args()

    load_dotenv(SCRIPT_DIR / ".env")
    api_key = os.getenv("XAI_API_KEY")
    if not api_key:
        print("ERROR: XAI_API_KEY not set in People/python/.env", file=sys.stderr)
        sys.exit(1)

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    all_pfps = sorted(PFP_DIR.glob("*.png"))
    if not all_pfps:
        print(f"ERROR: no .png files found in {PFP_DIR}", file=sys.stderr)
        sys.exit(1)
    all_names = [p.stem for p in all_pfps]

    manifest = load_manifest()
    manifest = ensure_assignments(manifest, all_names)
    print(f"manifest has {len(manifest)} assignments", flush=True)

    if args.person:
        target = PFP_DIR / f"{args.person}.png"
        if not target.exists():
            print(f"ERROR: {target} not found", file=sys.stderr)
            sys.exit(1)
        targets = [target]
    elif args.test:
        missing = [p for p in all_pfps if not (VIDEOS_DIR / f"{p.stem}.mp4").exists()]
        pool = missing or all_pfps
        targets = [random.choice(pool)]
        print(f"[test mode] picked: {targets[0].stem}", flush=True)
    else:
        targets = all_pfps

    failures = []
    completed = []
    skipped = []
    stopped_early = False
    for pfp in targets:
        name = pfp.stem
        out_path = VIDEOS_DIR / f"{name}.mp4"
        if out_path.exists() and not args.force:
            print(f"[{name}] already exists, skipping (use --force to overwrite)", flush=True)
            skipped.append(name)
            continue
        try:
            generate_for_person(api_key, pfp, out_path, manifest[name])
            completed.append(name)
        except FatalAPIError as e:
            print(f"\n[{name}] FATAL — stopping batch: {e}", file=sys.stderr, flush=True)
            print("Add credits / fix auth and re-run the script — completed videos will be skipped.", file=sys.stderr, flush=True)
            stopped_early = True
            break
        except Exception as e:
            print(f"[{name}] FAILED: {e}", file=sys.stderr, flush=True)
            failures.append(name)

    print(f"\n=== summary ===", flush=True)
    print(f"completed this run: {len(completed)} ({', '.join(completed) if completed else '-'})", flush=True)
    print(f"already existed:    {len(skipped)} ({', '.join(skipped) if skipped else '-'})", flush=True)
    print(f"failed:             {len(failures)} ({', '.join(failures) if failures else '-'})", flush=True)
    remaining = [p.stem for p in all_pfps if not (VIDEOS_DIR / f"{p.stem}.mp4").exists()]
    print(f"still missing:      {len(remaining)} ({', '.join(remaining) if remaining else '-'})", flush=True)

    if stopped_early or failures:
        sys.exit(2)


if __name__ == "__main__":
    main()
