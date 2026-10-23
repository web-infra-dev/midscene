# @midscene/computer

Desktop automation library for Midscene, providing AI-powered testing and automation capabilities for Windows, macOS, and Linux, with RDP support for remote Windows desktops.

See <https://midscenejs.com/platforms/desktop>.

### Independent native region timing

`RegionObservation.start({ command, args, geometry, maxFrames })` is a bounded,
no-inference measurement channel, separate from Agent screenshots. Pass the helper
`--region x,y,width,height --verify-monotonic`; `geometry` specifies output-local
logical x/y/width/height, outputIndex, integer scale, physical outputWidth/Height
and transform: 0. The caller must verify the compositor clock mapping. Rotated,
clipped or fractional-scale geometry is unsupported and fails closed.

`frames()` returns independent PNG bytes, immutable geometry, frameId and source
timing together. Stop with `await stop()` in `finally`; issued evidence remains
readable. Missing sequence IDs, changed geometry/clock, unexpected EOF or capacity
overflow reject timing judgment, even after stopping. Use a bounded observation
window and sufficient maxFrames; no frames are silently thinned. This interface
cannot be supplied as an Agent DeviceFrameSource. Full-screen sources reject ROI
wire frames. Crop sampling still cannot establish physical presentation time or
resolve a transition between two captured frames; intervals crossing a threshold
remain inconclusive. Retain full-screen screenshots independently for context.
