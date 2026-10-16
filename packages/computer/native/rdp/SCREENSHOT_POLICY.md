# RDP screenshot freshness policy

Screenshot freshness is best effort. RefreshRect requests a redraw, but has no
request ID or completion receipt. EndFrame finishes one graphics frame, not a
particular refresh request. Neither a completed frame nor full-screen paint
coverage proves that the server processed the preceding input or that the
application reached its intended state.

After input, when RefreshRect is negotiated, the helper requests the whole
desktop and waits for observed paint regions to cover it. It unions the actual
rectangles across multiple graphics frames; a server is not required to redraw
the entire desktop in one frame. Overlapping regions count only once. Frames
already decoding when the request was sent are excluded, but updates still in
transit and unrelated animations may contribute to subsequent coverage.

Before copying pixels, the helper waits for the graphics-frame target observed
after coverage is satisfied. Later animation frames do not extend that target.
These conditions have a shared three-second deadline. Failure to observe the
required coverage or frame completion throws an error rather than silently
returning the cached image. A resize resets coverage and requests the new size;
disconnect wakes the waiter. Without RefreshRect support, screenshots use the
live local framebuffer and the available graphics-frame barrier.

This policy improves the chance of receiving recent pixels; it provides neither
an exact refresh-completion guarantee nor a bound on server-side frame age.
Client receipt time alone cannot establish capture age. Strict correlation
would require additional server cooperation. Callers must still verify the
application outcome independently.

The cross-frame regression test simulates partial redraws across frame
boundaries. It validates the client's policy, not a reproduced multi-frame
RefreshRect failure on Windows RDP or xrdp.

Protocol references:

- [Refresh Rect PDU structure](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpbcgr/fe04a39d-dc10-489f-bea7-08dad5538547)
- [Processing EndFrame](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpegfx/b140c496-b743-4548-84d9-f3c0b151f374)
