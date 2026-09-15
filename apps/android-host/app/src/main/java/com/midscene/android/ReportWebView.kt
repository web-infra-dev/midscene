package com.midscene.android

import android.content.Context
import android.net.Uri
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.io.File
import java.io.IOException

/**
 * The artefact area reads as a document rather than as more console chrome, so it sits in
 * a framed panel: inset from the surrounding layout, rounded, hairline outline. The
 * embedded History pane and the standalone viewer both use it, so a report looks the same
 * in either place.
 */
@Composable
internal fun ArtefactPanel(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier.padding(10.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        content = content,
    )
}

/**
 * The one way this app puts a Midscene report on screen: the embedded History pane and
 * the standalone artefact viewer both come through here, so a report that renders in one
 * renders in the other.
 *
 * Reports are self-contained single-file HTML that boots from an embedded script, so no
 * network or extra assets are needed; the `file://` switches below are what let that
 * script run and read its own subresources.
 *
 * The report is a *desktop* layout — a sidebar beside a detail pane, `html, body {
 * overflow: hidden }`, every pane scrolling inside itself. Laid out at a phone-width
 * viewport its columns overlap and everything past the screen edge is unreachable,
 * because the page itself never scrolls. So it is not loaded directly: it goes in a
 * fixed-width frame inside [reportWrapperFor], which hands the report a desktop viewport
 * and scales that canvas down to this screen. Everything is visible at once, pinch-zoom
 * reads the detail, and the panes inside keep their own scrolling.
 *
 * [holder] keeps the parsed document (several megabytes) alive across composable
 * teardown: the console re-attaches the same instance when the user comes back to
 * History instead of paying for the parse again. The page is only (re)loaded when the
 * path changes.
 */
@Composable
internal fun ReportWebView(
    path: String,
    holder: MutableState<WebView?>,
    onReady: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    key(path) {
        AndroidView(
            modifier = modifier,
            // Compose only ever parents this throwaway FrameLayout; the WebView (and
            // its parsed document) is moved in and out by us, so re-entering the screen
            // never hits "the specified child already has a parent".
            factory = { context ->
                FrameLayout(context).apply {
                    val web = holder.value ?: WebView(context).apply {
                        setBackgroundColor(android.graphics.Color.WHITE)
                        settings.javaScriptEnabled = true
                        settings.allowFileAccess = true
                        settings.allowFileAccessFromFileURLs = true
                        // Reports are self-contained; they do not need file-origin
                        // JavaScript to request arbitrary network resources.
                        settings.allowUniversalAccessFromFileURLs = false
                        settings.domStorageEnabled = true
                        // Reading a scaled-down desktop canvas needs zoom.
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false
                    }
                    // Switching reports disposes the previous container: the WebView may
                    // still be attached to it, and adding a parented child throws.
                    (web.parent as? ViewGroup)?.removeView(web)
                    holder.value = web
                    val url = "file://${reportWrapperFor(context, path).absolutePath}"
                    // Re-bound on every entry: a client captured at creation reports to
                    // the composition that built it, so later selections never heard
                    // that their report had finished and kept the loading state up.
                    web.webViewClient = object : WebViewClient() {
                        private val startedAt = System.currentTimeMillis()

                        override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                            if (view == null) {
                                onReady()
                                return
                            }
                            // The wrapper paints long before the report inside it does,
                            // so readiness is asked of the frame: otherwise the "Rendering
                            // report…" cover disappears over an empty pane.
                            awaitInnerReport(view, 0)
                        }

                        private fun awaitInnerReport(view: WebView, attempt: Int) {
                            view.evaluateJavascript(INNER_REPORT_READY_JS) { state ->
                                if (state == "true" || attempt >= INNER_REPORT_ATTEMPTS) {
                                    Log.i(
                                        "MidsceneReport",
                                        "report ready in " +
                                            "${System.currentTimeMillis() - startedAt} ms",
                                    )
                                    onReady()
                                } else {
                                    view.postDelayed(
                                        { awaitInnerReport(view, attempt + 1) },
                                        INNER_REPORT_POLL_MS,
                                    )
                                }
                            }
                        }
                    }
                    addView(
                        web,
                        FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.MATCH_PARENT,
                            FrameLayout.LayoutParams.MATCH_PARENT,
                        ),
                    )
                    // Loaded after it is attached: a WebView that starts its first load
                    // while detached paints the page background and then never commits
                    // the rendered document on this WebView build.
                    if (web.url != url) {
                        web.loadUrl(url)
                    } else {
                        // Already showing this report (it is cached): no reload.
                        onReady()
                    }
                }
            },
            onRelease = { container ->
                (container as? ViewGroup)?.removeAllViews()
            },
        )
    }
}

/** Wide enough for the report's sidebar plus its detail pane, as on a desktop window. */
private const val REPORT_CANVAS_WIDTH = 1024

/** Poll for the report inside the frame: 40 × 300ms covers a many-megabyte parse. */
private const val INNER_REPORT_ATTEMPTS = 40
private const val INNER_REPORT_POLL_MS = 300L

private const val INNER_REPORT_READY_JS = """
    (function () {
      var frame = document.getElementById('report');
      if (!frame || !frame.contentDocument) { return 'false'; }
      return frame.contentDocument.readyState === 'complete' ? 'true' : 'false';
    })();
"""

/**
 * Write the one-screen wrapper that holds one report.
 *
 * A frame is the only way to give the report a viewport wider than the phone: a viewport
 * meta tag can only be honoured while the page is parsed, so neither removing it nor
 * `setUseWideViewPort` re-lays out a document that is already on screen. Inside an
 * `<iframe>` the report is laid out at this element's width instead (viewport meta tags
 * do not apply to frames), and the wrapper scales that canvas to the screen — the report
 * keeps its own scrolling, and pinch-zoom reads it.
 */
private fun reportWrapperFor(context: Context, reportPath: String): File {
    val dir = File(context.cacheDir, "report-view")
    if (!dir.isDirectory && !dir.mkdirs()) {
        throw IOException("cannot create ${dir.absolutePath}")
    }
    val wrapper = File(dir, Integer.toHexString(reportPath.hashCode()) + ".html")
    // One wrapper per report, and a cached WebView keeps its parsed copy in memory, so
    // wrappers for reports that are no longer open are dead weight.
    dir.listFiles()?.forEach { stale ->
        if (stale.name != wrapper.name) {
            stale.delete()
        }
    }
    wrapper.writeText(
        """
        <!doctype html>
        <html>
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html, body { margin: 0; height: 100%; overflow: hidden; background: #f2f4f7; }
          #report {
            display: block;
            border: 0;
            width: ${REPORT_CANVAS_WIDTH}px;
            height: 800px;
            transform-origin: 0 0;
          }
        </style>
        </head>
        <body>
        <iframe id="report" src="${Uri.fromFile(File(reportPath))}"></iframe>
        <script>
          (function () {
            var frame = document.getElementById('report');
            function fit() {
              var scale = window.innerWidth / $REPORT_CANVAS_WIDTH;
              frame.style.transform = 'scale(' + scale + ')';
              frame.style.height = Math.round(window.innerHeight / scale) + 'px';
            }
            window.addEventListener('resize', fit);
            fit();
          })();
        </script>
        </body>
        </html>
        """.trimIndent(),
    )
    return wrapper
}
