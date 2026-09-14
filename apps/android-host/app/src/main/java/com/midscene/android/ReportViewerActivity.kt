package com.midscene.android

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.midscene.android.ui.theme.MidsceneTheme
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files

/**
 * Opens a run artefact: Midscene's HTML report in a WebView, or a plain run log.
 *
 * Midscene reports are self-contained HTML files, so no network or extra assets are
 * needed to render them on the phone. The screen around the artefact is Compose, like
 * the console: same header, same tokens, and the console's dark/light preference is
 * respected (the View version hardcoded dark grey text, which was unreadable once the
 * console gained a dark theme). The report body itself is the same [ReportWebView] the
 * embedded History pane uses — one report renderer, two places to put it.
 */
class ReportViewerActivity : ComponentActivity() {

    /**
     * Owned by the activity, not the composition: the parsed document is several
     * megabytes, and it is released in [onDestroy] rather than when the composable
     * happens to leave the tree.
     */
    private val reportView = mutableStateOf<WebView?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val title = intent.getStringExtra(EXTRA_TITLE) ?: getString(R.string.report_viewer_label)
        val path = intent.getStringExtra(EXTRA_PATH)
        val html = intent.getBooleanExtra(EXTRA_HTML, false)
        // Keeps the recents entry named after the artefact, as it was before the
        // header moved into Compose (the theme has no action bar to show a title in).
        setTitle(title)

        setContent {
            // Read the system default outside remember{ }: its lambda is not composable.
            val systemDark = isSystemInDarkTheme()
            val dark = remember { ThemePrefs.isDark(this, systemDark) }
            MidsceneTheme(darkTheme = dark) {
                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .safeDrawingPadding(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    ArtefactScreen(
                        title = title,
                        path = path,
                        html = html,
                        reportView = reportView,
                        onBack = { finish() },
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        reportView.value?.let { web ->
            web.stopLoading()
            web.destroy()
        }
        reportView.value = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_TITLE = "title"
        const val EXTRA_PATH = "path"
        const val EXTRA_HTML = "html"
    }
}

@Composable
private fun ArtefactScreen(
    title: String,
    path: String?,
    html: Boolean,
    reportView: MutableState<WebView?>,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        // The console's top bar in miniature: title on the left, and the back button where
        // the settings entry sits on the console bar — one row, icon buttons only.
        Row(
            Modifier.fillMaxWidth().padding(start = 20.dp, top = 2.dp, end = 8.dp, bottom = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.common_back),
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        val file = path?.takeIf { it.isNotEmpty() }?.let(::File)
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                file == null || !file.exists() -> MissingArtefact(path)
                html -> ReportArtefact(file.path, reportView)
                else -> LogArtefact(file)
            }
        }
    }
}

/** A run whose file was pruned or deleted on the device. */
@Composable
private fun MissingArtefact(path: String?) {
    Box(Modifier.fillMaxSize().padding(24.dp)) {
        Text(
            stringResource(R.string.report_viewer_file_not_found, path.toString()),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

/**
 * The whole log, monospace and selectable so a failure can be copied out.
 *
 * The console's log panes use the same style; the old standalone viewer drew 10sp
 * dark grey text that ignored the theme.
 */
@Composable
private fun LogArtefact(file: File) {
    val context = LocalContext.current
    val text = remember(file.path) { readLog(context, file) }
    ArtefactPanel {
        Box(
            Modifier.fillMaxSize()
                .padding(14.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            SelectionContainer {
                Text(
                    text,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun readLog(context: android.content.Context, file: File): String = try {
    String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)
} catch (error: Exception) {
    context.getString(R.string.report_viewer_read_error, file.path, error)
}

/**
 * The report is HTML that brings its own styling (including its own white background, so
 * it is not a dark-mode surface); until it has parsed it says so instead of showing an
 * empty pane.
 */
@Composable
private fun ReportArtefact(path: String, holder: MutableState<WebView?>) {
    var ready by remember(path) { mutableStateOf(false) }
    ArtefactPanel {
        ReportWebView(
            path = path,
            holder = holder,
            onReady = { ready = true },
            modifier = Modifier.fillMaxSize(),
        )
        if (!ready) {
            Column(
                Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    stringResource(R.string.report_viewer_rendering),
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    stringResource(R.string.report_viewer_rendering_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
