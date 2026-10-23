# v1.17.0 宣传动画 / Highlights animation

## 高清导出

在仓库根目录执行（需要已安装仓库依赖、Playwright Chromium 和 PATH 中的 FFmpeg）：

```sh
node promo/v1.17-highlights/export-video.cjs
```

默认导出中文、1920×1080、30 fps 的 MP4 到 `midscene_run/promo-export/`。使用 PNG 逐帧截图，再编码为 H.264（CRF 16），不使用 Playwright 的 WebM 录屏。无音轨，页面背景铺满画面，不包含播放控件。

```sh
# 英文 / English
node promo/v1.17-highlights/export-video.cjs --lang en
# 4K 60 fps、自定义输出 / 4K 60 fps and custom output
node promo/v1.17-highlights/export-video.cjs --resolution 4k --fps 60 --output /tmp/midscene-highlights-4k.mp4
# 验证时间轴 / Validate the timeline
node --test promo/v1.17-highlights/export.test.cjs
```

`--resolution 4k` 使用 2 倍设备像素密度直接渲染 3840×2160 的截图，不进行视频放大。静止画面复用 PNG，但保留每一帧及原有时长。

`index.html?export=1` 禁止实时播放，通过 `window.__promoExport.renderFrame(ms)` 推进时间。任务、CSS 过渡和动画使用同一个虚拟时钟；时间只能向前推进，重新加载页面可重置。总时长可从 `window.__promoExport.duration` 获取。普通预览不带 `export=1`，仍支持原有播放控制。

## High-quality export

Run the commands above from the repository root with workspace dependencies, Playwright Chromium, and FFmpeg installed. The default is a silent Chinese 1920×1080, 30 fps MP4 in `midscene_run/promo-export/`. PNG frames are encoded directly to H.264 at CRF 16, without an intermediate WebM recording. The background fills the frame and playback controls are hidden.

`--resolution 4k` renders native 3840×2160 screenshots at 2× device pixel density. It does not upscale the video. Static frames reuse PNG data without changing frame count or duration.

Export mode (`?export=1`) uses a shared virtual clock for actions, CSS transitions, and animations. Call `window.__promoExport.renderFrame(ms)` with monotonically increasing times up to `window.__promoExport.duration`. Reload to restart. Normal playback is unchanged when the export parameter is omitted.
