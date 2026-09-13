package com.midscene.localagent

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
                        settings.allowUniversalAccessFromFileURLs = true
                        settings.domStorageEnabled = true
                    }
                    // Switching reports disposes the previous container: the WebView may
                    // still be attached to it, and adding a parented child throws.
                    (web.parent as? ViewGroup)?.removeView(web)
                    holder.value = web
                    val url = "file://$path"
                    // Re-bound on every entry: a client captured at creation reports to
                    // the composition that built it, so later selections never heard
                    // that their report had finished and kept the loading state up.
                    web.webViewClient = object : WebViewClient() {
                        private val startedAt = System.currentTimeMillis()
                        override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                            Log.i(
                                "MidsceneReport",
                                "report ready in ${System.currentTimeMillis() - startedAt} ms",
                            )
                            onReady()
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
