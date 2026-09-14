#!/usr/bin/env python3

import base64
import json
import os
from pathlib import Path
import select
import struct
import subprocess
import sys
import time
import zlib


def request(process, request_id, payload, timeout=30):
    process.stdin.write(json.dumps({"id": request_id, "payload": payload}) + "\n")
    process.stdin.flush()
    ready, _, _ = select.select([process.stdout], [], [], timeout)
    if not ready:
        raise RuntimeError(f"RDP helper timed out handling {request_id}")
    line = process.stdout.readline()
    if not line:
        raise RuntimeError(f"RDP helper exited while handling {request_id}")
    response = json.loads(line)
    if not response.get("ok"):
        raise RuntimeError(f"{request_id} failed: {response.get('error')}")
    return response["payload"]


def decode_rgba(data_url):
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise RuntimeError("screenshot response is not a PNG data URL")
    png = base64.b64decode(data_url[len(prefix) :])
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("screenshot has an invalid PNG signature")

    offset = 8
    width = height = None
    compressed = bytearray()
    while offset < len(png):
        length = struct.unpack(">I", png[offset : offset + 4])[0]
        kind = png[offset + 4 : offset + 8]
        chunk = png[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if kind == b"IHDR":
            width, height = struct.unpack(">II", chunk[:8])
        elif kind == b"IDAT":
            compressed.extend(chunk)
        elif kind == b"IEND":
            break

    if not width or not height:
        raise RuntimeError("screenshot PNG is missing dimensions")
    rows = zlib.decompress(compressed)
    row_size = width * 4 + 1
    if len(rows) != row_size * height or any(rows[y * row_size] for y in range(height)):
        raise RuntimeError("screenshot PNG uses an unexpected pixel layout")
    rgba = b"".join(rows[y * row_size + 1 : (y + 1) * row_size] for y in range(height))
    return width, height, rgba, png


def write_report(
    output_dir,
    first_png,
    second_png,
    black_png,
    width,
    height,
    non_black,
    black_ratio,
    elapsed,
):
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "first-screenshot.png").write_bytes(first_png)
    (output_dir / "second-screenshot.png").write_bytes(second_png)
    (output_dir / "black-screenshot.png").write_bytes(black_png)
    summary = {
        "desktopSize": {"width": width, "height": height},
        "firstScreenshotNonBlackRatio": non_black / (width * height),
        "laterScreenshotSeconds": elapsed,
        "laterScreenshotChanged": True,
        "blackScreenshotNonBlackRatio": black_ratio,
        "result": "passed",
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "report.html").write_text(
        f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Midscene RDP E2E report</title>
<style>body{{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px}}
img{{max-width:100%;border:1px solid #ccc}} code{{background:#eee;padding:2px 5px}}</style>
<h1>Midscene RDP E2E report</h1>
<p><strong>Passed.</strong> Connected to a local xrdp server through the compiled
<code>rdp-helper</code>, captured the first desktop, sent text input, captured the
updated desktop, and disconnected cleanly.</p>
<ul><li>Desktop: {width} × {height}</li>
<li>First screenshot non-black pixels: {non_black / (width * height):.1%}</li>
<li>Later screenshot latency: {elapsed:.3f}s</li>
<li>Black screenshot non-black pixels: {black_ratio:.1%}</li></ul>
<h2>First screenshot</h2><img src="first-screenshot.png">
<h2>After typing</h2><img src="second-screenshot.png">
<h2>Valid black framebuffer</h2><img src="black-screenshot.png">
</html>
""",
        encoding="utf-8",
    )


def main():
    helper = sys.argv[1]
    process = subprocess.Popen(
        [helper],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    try:
        connected = request(
            process,
            "connect",
            {
                "type": "connect",
                "config": {
                    "host": "127.0.0.1",
                    "port": int(os.environ.get("MIDSCENE_XRDP_PORT", "3389")),
                    "username": os.environ["MIDSCENE_XRDP_USERNAME"],
                    "password": os.environ["MIDSCENE_XRDP_PASSWORD"],
                    "ignoreCertificate": True,
                    "desktopWidth": 1280,
                    "desktopHeight": 720,
                },
            },
        )
        size = connected["info"]["size"]
        if size != {"width": 1280, "height": 720}:
            raise RuntimeError(f"unexpected negotiated desktop size: {size}")

        first = request(process, "first-screenshot", {"type": "screenshot"})
        width, height, first_pixels, first_png = decode_rgba(first["base64"])
        non_black = sum(
            1
            for index in range(0, len(first_pixels), 4)
            if any(first_pixels[index : index + 3])
        )
        if (width, height) != (1280, 720) or non_black < width * height * 0.15:
            raise RuntimeError("first screenshot did not contain the rendered desktop")

        request(process, "type", {"type": "typeText", "text": "midscene-rdp-ci"})
        time.sleep(0.5)
        started = time.monotonic()
        second = request(process, "second-screenshot", {"type": "screenshot"})
        elapsed = time.monotonic() - started
        _, _, second_pixels, second_png = decode_rgba(second["base64"])
        if second_pixels == first_pixels:
            raise RuntimeError("later screenshot did not observe the updated desktop")
        if elapsed >= 2:
            raise RuntimeError(f"later screenshot unexpectedly settled for {elapsed:.2f}s")

        request(process, "clear", {"type": "clearInput"})
        request(
            process,
            "show-black",
            {"type": "typeText", "text": "__MIDSCENE_BLACK__"},
        )
        time.sleep(0.5)
        black = request(process, "black-screenshot", {"type": "screenshot"})
        _, _, black_pixels, black_png = decode_rgba(black["base64"])
        black_non_black = sum(
            1
            for index in range(0, len(black_pixels), 4)
            if any(black_pixels[index : index + 3])
        )
        black_ratio = black_non_black / (width * height)
        if black_ratio >= 0.01:
            raise RuntimeError(
                f"black framebuffer contained {black_ratio:.1%} non-black pixels"
            )

        request(process, "disconnect", {"type": "disconnect"})
        output_dir = os.environ.get("MIDSCENE_XRDP_ARTIFACT_DIR")
        if output_dir:
            write_report(
                Path(output_dir),
                first_png,
                second_png,
                black_png,
                width,
                height,
                non_black,
                black_ratio,
                elapsed,
            )
        print(
            f"xrdp E2E passed: {width}x{height}, "
            f"{non_black / (width * height):.1%} non-black, "
            f"later screenshot {elapsed:.2f}s, black frame {black_ratio:.1%} non-black"
        )
    finally:
        if process.stdin:
            process.stdin.close()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        stderr = process.stderr.read() if process.stderr else ""
        if process.returncode != 0 or sys.exc_info()[0] is not None:
            print(stderr, file=sys.stderr)


if __name__ == "__main__":
    main()
