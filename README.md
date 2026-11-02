# Echo Next

A separate, runnable development version of Echo focused on dependable artwork depth. The original `echo_rust` source and freeze notices are untouched. Historical design documents are preserved in `docs/`; this file describes the new work and current verification.

## Run

From your normal laptop terminal:

```sh
cd ~/Projects/echo-next
./start.sh
```

The launcher builds the current source and opens the native GTK/WebKit player. Rust, GTK 3, WebKitGTK 4.1, GStreamer and development headers are required; these were available on your host during testing. The original dependency versions and lockfile are retained. Optional `./install.sh` builds an optimized release inside this project without installing packages or changing system files; launch that build with `./target/release/echo`.

Choose your music folder in Setup. Settings, history, library index, models and depth cache are separated under `~/.local/share/echo-next/`; frontend preferences use separate `echo-next.*` keys. Nothing migrates or overwrites your original Echo data. Startup no longer edits the compositor configuration.

## What changed

- A real RGBA foreground cutout replaces the old grayscale-as-opacity treatment. Adaptive three-plane thresholding includes the subject's middle depth as well as its nearest detail, with feathered edges and preserved original transparency.
- Both image layers use identical positioning and cropping. The artwork stays still; foreground can cover lyrics while transport, seeking and audio controls remain above it.
- Depth becomes visible only after the background and subject have loaded. Stale image callbacks cannot bring back artwork from a skipped track. Failed or stalled images fall back to flat artwork with a retry path.
- Setup includes depth on/off, automatic/manual foreground cutoff, model/computation/error status, and retry. Abstract covers or scenes without a distinct foreground may still need manual adjustment or flat mode: depth estimation is not semantic person/object segmentation.
- The model loads on the worker rather than blocking window startup. Failed initialization can be retried, and queued work favors the latest track.
- Depth output shape and numeric values are validated. Invalid cached images are recomputed, and masks are written through temporary files.
- More defined dark panels and reduced-motion handling replace part of the older glass-heavy styling.

The pinned Depth Anything V2 Small model downloads on first use if absent and is checksum-verified. The first download needs internet access; normal playback and cached depth are local.

## Verification

Executed on this laptop:

- `cargo test --locked`: 51 native tests pass; one fixture-dependent integration test is ignored in the default suite.
- The ignored integration test was then run explicitly with the actual ONNX model and a portrait cover: extraction → inference → cached mask → RGBA cutout passed. The 800×600 result contained 240,738 opaque and 190,622 fully transparent pixels.
- `node --test tests/depth-stage.test.mjs`: six loading, stale-result, failure, retry and fallback tests pass.
- `tests/browser.mjs`: Chromium checks the bundled frontend using the actual generated artwork, with a simulated backend bridge. Checks include depth readiness, alignment, control stacking, toggles, manual cutoff, fallback/retry, and 1100/760-pixel layouts.
- Native build, GStreamer/model self-test, and a bounded native window/WebKit startup smoke test pass. This is not a claim that every native interaction, music library, cover, or audio transition has been manually reviewed.

`cargo fmt --check` reports formatting differences, including inherited source. A repository-wide reformat was intentionally not mixed into this change.

## Reproduce the real-model check

Provide a model and an audio file with embedded or sidecar artwork. This writes the normal Echo Next depth cache, not the original Echo cache.

```sh
ECHO_DEPTH_MODEL=/path/to/depth-anything-v2-small.onnx \
ECHO_DEPTH_TRACK=/path/to/song.flac \
ECHO_DEPTH_OUTPUT=/path/to/subject.png \
cargo test --locked real_depth_pipeline_produces_a_solid_transparent_cutout -- --ignored --nocapture
```

The browser test requires `.qa/background.png` and `.qa/subject.png` and currently imports Playwright from the bundled development runtime. Adjust that import on another machine. Screenshots are in `.qa/screenshots/`.

The portrait test fixture is NASA's Eileen Collins image distributed as the [scikit-image astronaut sample](https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/astronaut.png); it is test material, not bundled album artwork for your library. Demo audio is a generated three-second sine tone.
