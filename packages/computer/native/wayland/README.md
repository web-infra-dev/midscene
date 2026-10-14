# Optional Wayland observation source

This helper captures real compositor pixels through wlr-screencopy v3. It does not inject input. Build explicitly with a C compiler, `wayland-scanner`, and development packages for `wayland-client` and `libpng`:

```sh
sh packages/computer/native/wayland/build.sh /tmp/midscene-wayland
```

Run inside the desktop session being measured (inside the guest for a VM). Stream stdout through `ObservationFrameSource.start({command, args})` and pass a factory as the Computer Agent's `observationFrameSource`. Use `startObserving({captureMode: 'source', maxFrames: 600})`; ordinary sampling remains the default. The factory must open a new source for each observation. The source image geometry must match the Agent's desktop; do not use a cropped source for Agent assertions.

`ready` is the compositor's frame timestamp, not physical display presentation or PNG completion. Hyprland 0.56.2 records it at the render commit callback. By default it has a separate, session-specific clock domain. `--verify-monotonic` is an explicit caller assertion that the compositor uses Linux CLOCK_MONOTONIC; every frame also checks that its timestamp lies between request and ready receipt. Only enable it after checking the compositor implementation. The boot ID then identifies the guest clock domain. The emitted bounds include ±1 microsecond conversion allowance. No host/guest offset is guessed.

Each NDJSON line binds frame identity, PNG, dimensions and timing. Capture pauses during encoding and transport backpressure; there is no guaranteed FPS. Inspect actual adjacent frame intervals. Overflow is counted in `droppedFrames`; source mode never silently thins the recording. `observer.recordEvent({name, timing})` records independently measured input bounds. `observation.exportRecord()` retains all collected frames, even when AI analysis selects only eight evidence images. Copy the record and images before disposal.

For a 500ms requirement, compare verified same-clock input and old/new pixel boundaries. Pass only if the upper latency bound is ≤500ms; fail only if the lower bound is >500ms; otherwise report inconclusive. Choose and document keydown/full-keypress/keyup semantics before interpreting results. A delayed encoder, transport, or model response is not a capture timestamp. Missing baselines, unexplained gaps, frame loss or unmatched clocks require review; an average FPS does not establish coverage.

The encoder uses lossless PNG filter NONE to avoid adaptive filter-search latency; `--png-filter adaptive` is available for a controlled baseline. `--trace` writes per-frame source/request/ready/encoded/emitted nanosecond values and byte counts to stderr, keyed by frameId. Redirect this bounded-duration diagnostic stream separately from NDJSON stdout. The ±1µs timestamp allowance covers numeric conversion only: it does not bound frame sampling gaps, scheduling, copy duration, clock synchronization uncertainty or physical presentation. Source review and same-guest clock checks are still required.

`benchmark-encoder.c` includes the actual encoder for local, inference-free measurements. Compile it with the same generated protocol source, includes and libraries as `build.sh`. Its arguments are `BGRA_FILE WIDTH HEIGHT STRIDE ADAPTIVE_FILTER OUTPUT_PNG`; it emits 100 elapsed-nanoseconds/PNG-bytes CSV rows after five warmups. Decode the PNG and compare all RGB pixels to the input. This benchmark does not measure guest frame cadence. Trace may contain an initial and completed entry for one frameId; merge them, retaining the completed emittedNs when present.
