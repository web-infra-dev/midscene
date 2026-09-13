package com.midscene.localagent

import android.content.Intent
import android.widget.Toast
import android.webkit.WebView
import android.widget.FrameLayout
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.midscene.localagent.ui.theme.MidsceneColors
import com.midscene.localagent.ui.theme.MidsceneTheme
import rikka.shizuku.Shizuku
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Consumer console: run an instruction, keep scripts, review runs, and a separate
 * diagnostics page for everything that used to clutter the main flow.
 *
 * Responsive by available width: phones get a bottom bar, tablets (>= 600dp) get a
 * navigation rail, and History becomes a list/detail two-pane layout.
 */
class ConsoleActivity : ComponentActivity() {

    /** Set when the service brings the console forward after a run. */
    private val openHistory = mutableStateOf(false)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra(EXTRA_OPEN_HISTORY, false)) {
            openHistory.value = true
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ShizukuExecBridge.ensureBound(this)
        ExecBridge.start(this)
        openHistory.value = intent?.getBooleanExtra(EXTRA_OPEN_HISTORY, false) == true
        setContent {
            // Read the system default outside remember{ }: its lambda is not composable.
            val systemDark = isSystemInDarkTheme()
            var dark by remember { mutableStateOf(ThemePrefs.isDark(this, systemDark)) }
            MidsceneTheme(darkTheme = dark) {
                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .safeDrawingPadding()
                        .imePadding(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    ConsoleShell(
                        dark = dark,
                        onDarkChange = {
                            dark = it
                            ThemePrefs.setDark(this, it)
                        },
                        openHistory = openHistory,
                    )
                }
            }
        }
    }
}

private data class Destination(val label: String, val icon: ImageVector)

private val DESTINATIONS = listOf(
    Destination("Run", Icons.Filled.Bolt),
    Destination("Scripts", Icons.Filled.Terminal),
    Destination("History", Icons.Filled.History),
)

@Composable
private fun ConsoleShell(
    dark: Boolean,
    onDarkChange: (Boolean) -> Unit,
    openHistory: MutableState<Boolean>,
) {
    var tab by remember { mutableStateOf(0) }

    // A finished run lands on the run list: that is where the result lives.
    LaunchedEffect(openHistory.value) {
        if (openHistory.value) {
            tab = 2
            openHistory.value = false
        }
    }
    val context = LocalContext.current
    var onboarded by remember { mutableStateOf(SetupPrefs.onboarded(context)) }
    val wide = LocalConfiguration.current.screenWidthDp >= 600


    // One WebView for the session: reports are several megabytes and re-parsing one
    // on every visit to History is what made the embedded view feel slower than a
    // standalone window.
    val reportView = remember { mutableStateOf<WebView?>(null) }

    if (!onboarded) {
        Onboarding(
            onDone = {
                SetupPrefs.setOnboarded(context, true)
                onboarded = true
            },
        )
        return
    }

    if (wide) {
        Row(Modifier.fillMaxSize()) {
            if (tab < 3) {
                NavigationRail(containerColor = MaterialTheme.colorScheme.surface) {
                    DESTINATIONS.forEachIndexed { index, destination ->
                        NavigationRailItem(
                            selected = tab == index,
                            onClick = { tab = index },
                            icon = { Icon(destination.icon, contentDescription = destination.label) },
                            label = { Text(destination.label, fontSize = 11.sp) },
                        )
                    }
                }
            }
            Screen(tab, dark, onDarkChange, reportView,
                onSettings = { tab = 3 },
                onBack = { tab = if (tab == 4) 3 else 0 },
                onDiagnostics = { tab = 4 })
        }
    } else {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                Screen(tab, dark, onDarkChange, reportView,
                    onSettings = { tab = 3 },
                    onBack = { tab = if (tab == 4) 3 else 0 },
                    onDiagnostics = { tab = 4 })
            }
            if (tab < 3) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    DESTINATIONS.forEachIndexed { index, destination ->
                        NavigationBarItem(
                            selected = tab == index,
                            onClick = { tab = index },
                            icon = { Icon(destination.icon, contentDescription = destination.label) },
                            label = { Text(destination.label, fontSize = 10.sp) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Screen(
    tab: Int,
    dark: Boolean,
    onDarkChange: (Boolean) -> Unit,
    reportView: MutableState<WebView?>,
    onSettings: () -> Unit,
    onBack: () -> Unit,
    onDiagnostics: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // The console tabs carry the product mark; Settings/Diagnostics are
                // sub-pages of it and only need their own title. The mark sits on the
                // brand colour, exactly like the launcher icon, so it stays legible on
                // the light and the dark surface.
                if (tab < 3) {
                    Box(
                        Modifier.size(30.dp)
                            .clip(MaterialTheme.shapes.small)
                            .background(MidsceneColors.Brand),
                        contentAlignment = Alignment.Center,
                    ) {
                        Image(
                            painter = painterResource(R.drawable.ic_brand_mark),
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    if (tab < 3) "Midscene" else if (tab == 3) "Settings" else "Diagnostics",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
            TextButton(onClick = if (tab < 3) onSettings else onBack) {
                Icon(
                    if (tab < 3) Icons.Filled.Settings else Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = if (tab < 3) "Settings" else "Back",
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        Box(Modifier.weight(1f)) {
            when (tab) {
                1 -> ScriptsScreen()
                2 -> HistoryScreen(reportView)
                3 -> SettingsScreen(dark, onDarkChange, onDiagnostics)
                4 -> DiagnosticsScreen()
                else -> RunScreen()
            }
        }
    }
}

// --------------------------------------------------------------------- run

/**
 * True while a run is in flight.
 *
 * Every screen that could interleave with a run locks its controls on this: starting a
 * second run, swapping the bundle under a running process, deleting the run's own log or
 * editing the config it is reading are all things the service would either ignore or
 * half-do. The service is the source of truth; the listener makes the change immediate
 * and the poll covers state flips that emit no log line.
 */
@Composable
private fun rememberRunBusy(): Boolean {
    var busy by remember { mutableStateOf(AgentService.isBusy()) }
    DisposableEffect(Unit) {
        val listener = AgentService.LogListener { busy = AgentService.isBusy() }
        AgentService.addListener(listener)
        onDispose { AgentService.removeListener(listener) }
    }
    LaunchedEffect(Unit) {
        while (true) {
            val actual = AgentService.isBusy()
            if (actual != busy) {
                busy = actual
            }
            delay(500)
        }
    }
    return busy
}

@Composable
@OptIn(ExperimentalComposeUiApi::class)
private fun RunScreen() {
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val context = LocalContext.current
    val store = remember { RunStore(context.filesDir) }
    var prompt by remember { mutableStateOf(SetupPrefs.lastInstruction(context)) }
    var busy by remember { mutableStateOf(AgentService.isBusy()) }
    var lastRun by remember { mutableStateOf(store.list().firstOrNull()) }

    DisposableEffect(Unit) {
        val listener = AgentService.LogListener { _ ->
            busy = AgentService.isBusy()
        }
        AgentService.addListener(listener)
        onDispose { AgentService.removeListener(listener) }
    }

    // Refresh the summary once a run has finished (busy flips back to false), and
    // poll the service so the header is right even when the app returns from the
    // background and no log line arrived in between.
    LaunchedEffect(busy) {
        if (!busy) {
            lastRun = store.list().firstOrNull()
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1200)
            val actual = AgentService.isBusy()
            if (actual != busy) {
                busy = actual
            }
        }
    }

    Box(Modifier.fillMaxSize()) { Column(
        Modifier.align(Alignment.TopCenter).widthIn(max = 920.dp).fillMaxWidth()
            .verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            if (busy) "Running · Stop at any time" else "Describe what you want your phone to do",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Card(
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(0.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(16.dp)) {
                SectionLabel(SelfCheckScript.INSTRUCTION_LABEL)
                Spacer(Modifier.height(10.dp))
                Box(
                    Modifier.fillMaxWidth().height(104.dp)
                        .clip(MaterialTheme.shapes.small)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(12.dp),
                ) {
                    if (prompt.isEmpty()) {
                        Text(
                            SelfCheckScript.INSTRUCTION_PLACEHOLDER,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        )
                    }
                    BasicTextField(
                        value = prompt,
                        onValueChange = { prompt = it },
                        textStyle = MaterialTheme.typography.bodyMedium.copy(
                            color = MaterialTheme.colorScheme.onSurface,
                        ),
                        modifier = Modifier.fillMaxSize()
                            .semantics { contentDescription = "Instruction input" },
                    )
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = {
                            focusManager.clearFocus()
                            SetupPrefs.rememberInstruction(context, prompt.trim())
                            AgentService.start(
                                context,
                                AgentService.ACTION_RUN_PROMPT,
                                Intent().putExtra(AgentService.EXTRA_PROMPT, prompt.trim()),
                            )
                            prompt = ""
                            busy = true
                            keyboard?.hide()
                        },
                        enabled = prompt.isNotBlank() && !busy,
                        shape = MaterialTheme.shapes.small,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MidsceneColors.Brand,
                            contentColor = Color.White,
                        ),
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Run", fontWeight = FontWeight.SemiBold)
                    }
                    OutlinedButton(
                        onClick = {
                            AgentService.start(context, AgentService.ACTION_STOP, null)
                            busy = AgentService.isBusy()
                        },
                        enabled = busy,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.weight(0.6f),
                    ) { Text("Stop") }
                }
            }
        }
        lastRun?.let { LastRunCard(it) { path, html -> openArtefact(context, path, html) } }
    }
    }
}

/** Summary of the previous run: status, duration and a shortcut to its artefacts. */
@Composable
private fun LastRunCard(record: RunStore.RunRecord, onOpen: (String, Boolean) -> Unit) {
    val hasReport = record.reportFile.isNotEmpty() && File(record.reportFile).exists()
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(0.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(10.dp).clip(CircleShape)
                    .background(if (record.ok) MidsceneColors.Success else MidsceneColors.Error),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (record.ok) "Last run succeeded" else "Last run reported errors",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    buildString {
                        append(
                            SimpleDateFormat("HH:mm", Locale.US).format(Date(record.startedAt)),
                        )
                        append(" · ")
                        append(record.durationMs / 1000)
                        append("s · ")
                        append(record.taskCount - record.failedTasks)
                        append("/")
                        append(record.taskCount)
                        append(" tasks")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = {
                if (hasReport) onOpen(record.reportFile, true) else onOpen(record.logFile, false)
            }) { Text(if (hasReport) "Report" else "Log", fontSize = 12.sp) }
        }
    }
}

private fun openArtefact(context: android.content.Context, path: String, html: Boolean) {
    context.startActivity(
        Intent(context, ReportViewerActivity::class.java)
            .putExtra(ReportViewerActivity.EXTRA_TITLE, if (html) "Run report" else "Run log")
            .putExtra(ReportViewerActivity.EXTRA_PATH, path)
            .putExtra(ReportViewerActivity.EXTRA_HTML, html),
    )
}

// ----------------------------------------------------------------- scripts

@Composable
private fun ScriptsScreen() {
    val context = LocalContext.current
    val file = remember { File(context.filesDir, "config.yaml") }
    var text by remember { mutableStateOf(ShellRunner.readText(file)) }
    var status by remember { mutableStateOf("") }
    val busy = rememberRunBusy()

    Box(Modifier.fillMaxSize()) { Column(
        Modifier.align(Alignment.TopCenter).widthIn(max = 920.dp).fillMaxWidth().fillMaxHeight().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            if (busy) {
                "A run is in progress — the script and its buttons are locked until it ends"
            } else {
                "Edit config.yaml to run tasks in order"
            },
            style = MaterialTheme.typography.bodyMedium,
            color = if (busy) MidsceneColors.Brand else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Card(
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(0.dp),
            modifier = Modifier.fillMaxWidth().weight(1f),
        ) {
            Box(
                Modifier.fillMaxSize()
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(12.dp),
            ) {
                BasicTextField(
                    value = text,
                    // Read-only during a run: the CLI is reading this file right now.
                    onValueChange = { if (!busy) text = it },
                    readOnly = busy,
                    textStyle = MaterialTheme.typography.bodySmall.copy(
                        color = if (busy) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    ),
                    modifier = Modifier.fillMaxSize()
                        .semantics { contentDescription = "Script editor" },
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    file.writeText(text)
                    status = "saved"
                    AgentService.start(
                        context,
                        AgentService.ACTION_RUN_CONFIG,
                        Intent().putExtra(AgentService.EXTRA_CONFIG_PATH, file.absolutePath),
                    )
                },
                shape = MaterialTheme.shapes.small,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MidsceneColors.Brand,
                    contentColor = Color.White,
                ),
                enabled = !busy,
                modifier = Modifier.weight(1f),
            ) { Text("Run") }
            OutlinedButton(
                onClick = { file.writeText(text); status = "saved" },
                enabled = !busy,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.weight(1f),
            ) { Text("Save") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = {
                // Self-bootstrapping check: write the script and run it without
                // leaving the app.
                val script = selfCheckConfig(context)
                text = script
                val target = java.io.File(context.filesDir, "self-check.yaml")
                target.writeText(script)
                status = "self-check running"
                AgentService.start(
                    context,
                    AgentService.ACTION_RUN_CONFIG,
                    Intent().putExtra(AgentService.EXTRA_CONFIG_PATH, target.absolutePath),
                )
            }, enabled = !busy) {
                // No explicit colour: the button's own enabled/disabled tint is what makes
                // "locked" legible next to New template.
                Text("Self-check", fontSize = 12.sp)
            }

            TextButton(onClick = {
                // A minimal, valid starting point for a new script.
                text = selfCheckConfig(context)
                status = "template loaded"
            }, enabled = !busy) { Text("New template", fontSize = 12.sp) }
            if (status.isNotEmpty()) {
                Text(
                    status,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }
    }
    }
}

// ----------------------------------------------------------------- history

@Composable
private fun HistoryScreen(reportView: MutableState<WebView?>) {
    val context = LocalContext.current
    val store = remember { RunStore(context.filesDir) }
    val busy = rememberRunBusy()
    var records by remember { mutableStateOf(store.list()) }
    var selected by remember { mutableStateOf<RunStore.RunRecord?>(null) }
    var pendingDelete by remember { mutableStateOf<RunStore.RunRecord?>(null) }

    // Rendered before the layout branches: a dialog is its own window, so it must
    // exist on both the phone and the tablet path (the wide branch returns early).
    pendingDelete?.let { record ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete this run?") },
            text = {
                Text(
                    "Its log, result and report will be removed from the device.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    store.delete(record)
                    pendingDelete = null
                    // Inlined: a local function declared further down is not visible here.
                    records = store.list()
                    if (records.none { it.id == selected?.id }) {
                        selected = null
                    }
                }) { Text("Delete", color = MidsceneColors.Error) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            },
        )
    }
    val wide = LocalConfiguration.current.screenWidthDp >= 600


    LaunchedEffect(Unit) {
        val loaded = withContext(Dispatchers.IO) { store.list() }
        records = loaded
        if (wide && selected == null) {
            selected = loaded.firstOrNull()
        }
    }

    fun reload() {
        records = store.list()
        if (selected != null && records.none { it.id == selected?.id }) {
            selected = null
        }
    }

    fun open(path: String, html: Boolean) {
        context.startActivity(
            Intent(context, ReportViewerActivity::class.java)
                .putExtra(ReportViewerActivity.EXTRA_TITLE, if (html) "Run report" else "Run log")
                .putExtra(ReportViewerActivity.EXTRA_PATH, path)
                .putExtra(ReportViewerActivity.EXTRA_HTML, html),
        )
    }

    if (wide) {
        Row(Modifier.fillMaxSize()) {
            LazyColumn(
                Modifier.width(340.dp).fillMaxHeight(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item { HistoryHeader(records.size) }
                items(records, key = { it.id }) { record ->
                    RunCard(
                        record = record,
                        highlighted = selected?.id == record.id,
                        canDelete = !busy,
                        onOpenReport = { selected = record },
                        onDetails = { selected = record },
                        onDelete = { pendingDelete = record },
                    )
                }
            }
            Box(Modifier.weight(1f).fillMaxHeight()) {
                val current = selected
                if (current == null) {
                    Box(Modifier.padding(16.dp)) { EmptyHint("Select a run to see its report") }
                } else {
                    RunDetailPane(
                        record = current,
                        store = store,
                        reportView = reportView,
                        canDelete = !busy,
                        onDelete = {
                            store.delete(current)
                            reload()
                        },
                    )
                }
            }
        }
        return
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { HistoryHeader(records.size) }
        if (records.isEmpty()) {
            item { EmptyHint("No runs yet.") }
        }
        items(records, key = { it.id }) { record ->
            RunCard(
                record = record,
                highlighted = false,
                canDelete = !busy,
                onOpenReport = { openRun(record, ::open) },
                onDetails = { selected = record },
                onDelete = { pendingDelete = record },
            )
        }
    }

    selected?.let { record ->
        AlertDialog(
            onDismissRequest = { selected = null },
            title = { Text(if (record.ok) "Run succeeded" else "Run reported errors") },
            text = { RunDetail(record, store, onOpen = ::open) },
            confirmButton = {
                if (record.reportFile.isNotEmpty() && File(record.reportFile).exists()) {
                    TextButton(onClick = { open(record.reportFile, true) }) { Text("Report") }
                }
            },
            dismissButton = {
                TextButton(onClick = { open(record.logFile, false) }) { Text("Log") }
            },
        )
    }

}

@Composable
private fun HistoryHeader(count: Int) {
    Column {
        Text("History", style = MaterialTheme.typography.headlineSmall)
        Text(
            if (count == 0) "Runs you start will appear here" else "$count runs · tap for log and report",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun EmptyHint(text: String) {
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(0.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text,
            Modifier.padding(20.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Tapping a card opens its report (the primary artefact); details are one tap away. */
private fun openRun(record: RunStore.RunRecord, open: (String, Boolean) -> Unit) {
    val hasReport = record.reportFile.isNotEmpty() && File(record.reportFile).exists()
    if (hasReport) open(record.reportFile, true) else open(record.logFile, false)
}

private fun relativeTime(millis: Long): String {
    val delta = System.currentTimeMillis() - millis
    val minutes = delta / 60_000
    return when {
        minutes < 1 -> "just now"
        minutes < 60 -> "$minutes min ago"
        minutes < 60 * 24 -> "${minutes / 60} h ago"
        else -> SimpleDateFormat("MM-dd HH:mm", Locale.US).format(Date(millis))
    }
}

/**
 * Run card: a status accent, the task name, a one-line summary and the actions that
 * matter (open the report, read the log, delete the run).
 */
@Composable
private fun RunCard(
    record: RunStore.RunRecord,
    highlighted: Boolean,
    canDelete: Boolean,
    onOpenReport: () -> Unit,
    onDetails: () -> Unit,
    onDelete: () -> Unit,
) {
    val statusColor = if (record.ok) MidsceneColors.Success else MidsceneColors.Error
    val statusSoft = if (record.ok) MidsceneColors.SuccessSoft else MidsceneColors.ErrorSoft
    val statusText = if (record.ok) MidsceneColors.SuccessText else MidsceneColors.Error
    val hasReport = record.reportFile.isNotEmpty() && File(record.reportFile).exists()
    val hasLog = record.logFile.isNotEmpty() && File(record.logFile).exists()

    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = if (highlighted) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(0.dp),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpenReport),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            // Status accent, the way studio marks a failing row.
            Box(Modifier.width(3.dp).fillMaxHeight().background(statusColor))
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        record.configName.ifEmpty { "run" },
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        if (record.ok) "Success" else "Failed",
                        style = MaterialTheme.typography.labelSmall,
                        color = statusText,
                        modifier = Modifier
                            .clip(MaterialTheme.shapes.extraSmall)
                            .background(statusSoft)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    buildString {
                        append(relativeTime(record.startedAt))
                        append("  ·  ")
                        append(record.durationMs / 1000)
                        append("s  ·  ")
                        append(record.taskCount - record.failedTasks)
                        append("/")
                        append(record.taskCount)
                        append(" tasks")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (hasReport) {
                        CardAction("Report", Icons.Filled.PlayArrow, onOpenReport)
                    }
                    if (hasLog) {
                        CardAction("Log", Icons.Filled.Terminal, onDetails)
                    }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onDelete, enabled = canDelete) {
                        Text("Delete", fontSize = 11.sp, color = MidsceneColors.Error)
                    }
                }
            }
        }
    }
}

@Composable
private fun CardAction(label: String, icon: ImageVector, onClick: () -> Unit) {
    Text(
        label,
        style = MaterialTheme.typography.labelSmall,
        color = MidsceneColors.Brand,
        modifier = Modifier
            .clip(MaterialTheme.shapes.extraSmall)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}

/**
 * Tablet detail pane: the report is rendered inside the app rather than handing the
 * user off to another window, with the captured log one toggle away.
 */
@Composable
private fun RunDetailPane(
    record: RunStore.RunRecord,
    store: RunStore,
    reportView: MutableState<WebView?>,
    canDelete: Boolean,
    onDelete: () -> Unit,
) {
    var reportReady by remember(record.id) { mutableStateOf(false) }
    var confirmDelete by remember(record.id) { mutableStateOf(false) }
    val hasReport = record.reportFile.isNotEmpty() && File(record.reportFile).exists()
    var showReport by remember(record.id) { mutableStateOf(hasReport) }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    record.configName.ifEmpty { "run" },
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    buildString {
                        append(relativeTime(record.startedAt))
                        append("  ·  ")
                        append(record.durationMs / 1000)
                        append("s  ·  exit ")
                        append(record.exitCode)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (hasReport) {
                TextButton(onClick = { showReport = true }) { Text("Report", fontSize = 12.sp) }
            }
            TextButton(onClick = { showReport = false }) { Text("Log", fontSize = 12.sp) }
            TextButton(onClick = { confirmDelete = true }, enabled = canDelete) {
                Text("Delete", fontSize = 12.sp, color = MidsceneColors.Error)
            }
        }

        if (confirmDelete) {
            AlertDialog(
                onDismissRequest = { confirmDelete = false },
                title = { Text("Delete this run?") },
                text = {
                    Text(
                        "Its log, result and report will be removed from the device.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                },
                confirmButton = {
                    TextButton(onClick = {
                        confirmDelete = false
                        onDelete()
                    }) { Text("Delete", color = MidsceneColors.Error) }
                },
                dismissButton = {
                    TextButton(onClick = { confirmDelete = false }) { Text("Cancel") }
                },
            )
        }

        if (showReport && hasReport) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                EmbeddedReport(
                    path = record.reportFile,
                    holder = reportView,
                    onReady = { reportReady = true },
                    modifier = Modifier.fillMaxSize(),
                )
                if (!reportReady) {
                    // A multi-megabyte report takes seconds to parse; say so instead
                    // of showing an empty white pane.
                    Column(
                        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Rendering report…", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Reports embed every screenshot, so the first render takes a moment.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        } else {
            Box(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
                Text(
                    store.readLog(record).takeLast(4000).ifEmpty { "No log captured." },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * Midscene reports are self-contained HTML, so a plain WebView renders them offline.
 *
 * The instance is owned by the console (`holder`) and re-attached here, and the
 * page is only (re)loaded when the path changes: revisiting History reuses the
 * parsed document instead of paying for it again.
 */
@Composable
private fun EmbeddedReport(
    path: String,
    holder: MutableState<WebView?>,
    onReady: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    key(path) {
        AndroidView(
            modifier = modifier,
            // Compose only ever parents this throwaway FrameLayout; the WebView (and
            // its parsed document) is moved in and out by us, so re-entering History
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
                    (web.parent as? android.view.ViewGroup)?.removeView(web)
                    holder.value = web
                    val url = "file://$path"
                    // Re-bound on every entry: a client captured at creation reports to
                    // the composition that built it, so later selections never heard
                    // that their report had finished and kept the loading state up.
                    web.webViewClient = object : android.webkit.WebViewClient() {
                        private val startedAt = System.currentTimeMillis()
                        override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                            android.util.Log.i(
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
                    if (web.url != url) {
                        web.loadUrl(url)
                    } else {
                        // Already showing this report (it is cached): no reload.
                        onReady()
                    }
                }
            },
            onRelease = { container ->
                (container as? android.view.ViewGroup)?.removeAllViews()
            },
        )
    }
}

@Composable
private fun RunDetail(
    record: RunStore.RunRecord,
    store: RunStore,
    onOpen: (String, Boolean) -> Unit,
) {
    Column(Modifier.verticalScroll(rememberScrollState())) {
        Text(
            "${record.configName} · ${record.durationMs / 1000}s · exit ${record.exitCode}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            store.readLog(record).takeLast(2000).ifEmpty { "No log captured." },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ------------------------------------------------------------- diagnostics

@Composable
private fun DiagnosticsScreen() {
    val context = LocalContext.current
    val busy = rememberRunBusy()
    val lines = remember { mutableStateListOf<String>() }

    DisposableEffect(Unit) {
        val listener = AgentService.LogListener { line ->
            lines.add(line)
            if (lines.size > 300) lines.removeAt(0)
        }
        AgentService.addListener(listener)
        onDispose { AgentService.removeListener(listener) }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Diagnostics", style = MaterialTheme.typography.headlineSmall)
        DiagnosticsCard("RUNTIME") {
            StatusRow("node", File(Provisioner.nodePath(context)).exists())
            StatusRow("agent bundle", Provisioner.cliFile(context).exists())
            StatusRow("yadb", File(Provisioner.YADB_TARGET).exists())
            StatusRow("shizuku user service", ShizukuExecBridge.isReady())
            StatusRow("overlay permission", OverlayView.canDraw(context))
            Spacer(Modifier.height(10.dp))
            val authorizeLabel = if (ShizukuAuth.authorized()) "Re-authorize" else "Authorize"
            if (busy) {
                // Extracting the bundle deletes the agent directory the running CLI is
                // executing from, so provisioning waits for the run to end.
                Text(
                    "Locked while a run is in progress",
                    style = MaterialTheme.typography.bodySmall,
                    color = MidsceneColors.Brand,
                )
                Spacer(Modifier.height(8.dp))
            }
            ActionRow(
                enabled = !busy,
                "Provision" to { AgentService.start(context, AgentService.ACTION_PROVISION, null) },
                authorizeLabel to {
                    if (ShizukuAuth.binderReady()) {
                        ShizukuAuth.request { }
                    } else {
                        openShizuku(context)
                    }
                },
            )
        }
        DiagnosticsCard("DEVICE") {
            ActionRow(
                enabled = true,
                "Battery" to { Battery.requestExemption(context) },
                "Shizuku" to { openShizuku(context) },
                "Overlay" to { Overlay.requestPermission(context) },
            )
        }
        DiagnosticsCard("STORAGE") {
            val store = remember { RunStore(context.filesDir) }
            var usage by remember { mutableStateOf(store.totalBytes()) }
            val runs = remember(usage) { store.list().size }
            Text(
                "Runs: $runs · ${usage / 1024 / 1024} MB of ${RunStore.MAX_BYTES / 1024 / 1024} MB " +
                    "(keeps at most ${RunStore.MAX_RUNS} runs)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            ActionRow(
                enabled = !busy,
                "Clean now" to {
                    store.prune()
                    usage = store.totalBytes()
                },
                "Refresh" to { usage = store.totalBytes() },
            )
        }

        DiagnosticsCard("SERVICE LOG") {
            Column(Modifier.height(180.dp).verticalScroll(rememberScrollState())) {
                lines.takeLast(150).forEach {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun DiagnosticsCard(title: String, content: @Composable () -> Unit) {
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(0.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            SectionLabel(title)
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
private fun StatusRow(label: String, ready: Boolean) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(
            if (ready) "ready" else "missing",
            style = MaterialTheme.typography.bodySmall,
            color = if (ready) MidsceneColors.SuccessText else MidsceneColors.Error,
        )
    }
}

@Composable
private fun ActionRow(enabled: Boolean = true, vararg actions: Pair<String, () -> Unit>) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        actions.forEach { (label, action) ->
            OutlinedButton(
                onClick = action,
                enabled = enabled,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.weight(1f),
            ) { Text(label, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

// ---------------------------------------------------------------- settings

@Composable
private fun SettingsScreen(dark: Boolean, onDarkChange: (Boolean) -> Unit, onDiagnostics: () -> Unit) {
    val context = LocalContext.current
    var overlayOn by remember { mutableStateOf(OverlayView.canDraw(context)) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        DiagnosticsCard("PREFERENCES") {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Dark theme", style = MaterialTheme.typography.bodyMedium)
                Switch(checked = dark, onCheckedChange = onDarkChange)
            }
            Spacer(Modifier.height(6.dp))
            var returnAfterRun: Boolean by remember {
                mutableStateOf(SetupPrefs.returnAfterRun(context))
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Open app after a run", style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "Brings Midscene back to the front when the agent finishes",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = returnAfterRun,
                    onCheckedChange = {
                        returnAfterRun = it
                        SetupPrefs.setReturnAfterRun(context, it)
                    },
                )
            }
            Spacer(Modifier.height(6.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Floating progress", style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "Shows what the agent is doing; hidden while it takes screenshots",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = overlayOn,
                    onCheckedChange = { wanted ->
                        if (wanted && !OverlayView.canDraw(context)) {
                            Overlay.requestPermission(context)
                        } else {
                            overlayOn = wanted
                            if (wanted) OverlayView.show(context, "Ready") else OverlayView.hide()
                        }
                    },
                )
            }
        }

        ModelCredentialsCard()

        DiagnosticsCard("DEVICE & SETUP") {
            ActionRow(
                enabled = true,
                "Diagnostics" to onDiagnostics,
                "Run setup again" to {
                    SetupPrefs.setOnboarded(context, false)
                    (context as? android.app.Activity)?.recreate()
                },
            )
        }
    }
}


// ------------------------------------------------------- model credentials

/**
 * Credentials editor style. Both labels mirror the desktop studio's Config modal, so
 * "Form Style" and ".env Style" mean the same thing on the phone and on the desktop.
 */
private enum class EnvStyle(val label: String) {
    FORM("Form Style"),
    ENV(".env Style"),
}

/**
 * Model credentials in the two shapes the desktop studio offers: a Form for the keys the
 * agent needs, and the raw `.env` text for everything else.
 *
 * Both styles edit the same in-memory text, so a switch carries every edit over and Save
 * always writes exactly what the screen shows. Form edits go through
 * [ModelEnvFile.setValue], which keeps comments and unknown keys, and the same class
 * parses the file for the agent process.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ModelCredentialsCard() {
    val context = LocalContext.current
    val file = remember { File(context.filesDir, "model.env") }
    var text by remember {
        mutableStateOf(ShellRunner.readText(file).ifEmpty { ModelEnvFile.TEMPLATE })
    }
    var style by remember { mutableStateOf(SetupPrefs.envStyle(context, EnvStyle.FORM)) }
    var apiKeyVisible by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    val missing = remember(text) { ModelEnvFile.missingKeys(text) }
    val busy = rememberRunBusy()

    DiagnosticsCard("MODEL CREDENTIALS") {
        Text(
            "Kept in the app's private storage and injected into the agent process; never written into a script.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(10.dp))
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            EnvStyle.entries.forEachIndexed { index, option ->
                SegmentedButton(
                    selected = style == option,
                    onClick = {
                        style = option
                        SetupPrefs.setEnvStyle(context, option)
                    },
                    shape = SegmentedButtonDefaults.itemShape(index, EnvStyle.entries.size),
                    // Brand blue, like the Run button: the M3 default is a violet that
                    // reads as a different product.
                    colors = SegmentedButtonDefaults.colors(
                        activeContainerColor = MidsceneColors.Brand,
                        activeContentColor = Color.White,
                    ),
                    label = { Text(option.label, fontSize = 12.sp) },
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        if (style == EnvStyle.FORM) {
            ModelEnvFields(
                text = text,
                apiKeyVisible = apiKeyVisible,
                onToggleApiKey = { apiKeyVisible = !apiKeyVisible },
                onChange = { key, value -> text = ModelEnvFile.setValue(text, key, value) },
            )
        } else {
            Box(
                Modifier.fillMaxWidth().height(150.dp)
                    .clip(MaterialTheme.shapes.small)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(12.dp),
            ) {
                BasicTextField(
                    value = text,
                    onValueChange = { text = it },
                    textStyle = MaterialTheme.typography.bodySmall.copy(
                        color = MaterialTheme.colorScheme.onSurface,
                    ),
                    modifier = Modifier.fillMaxSize()
                        .semantics { contentDescription = "Model env editor" },
                )
            }
        }

        Spacer(Modifier.height(10.dp))
        CredentialsStatus(missing)
        if (busy) {
            Spacer(Modifier.height(4.dp))
            Text(
                // The running process already has its environment; a save now would look
                // like it applied and silently not have.
                "Locked while a run is in progress: the running agent keeps the credentials it started with",
                style = MaterialTheme.typography.bodySmall,
                color = MidsceneColors.Brand,
            )
        }
        Spacer(Modifier.height(10.dp))
        ActionRow(
            enabled = !busy,
            "Save" to {
                file.writeText(text)
                Toast.makeText(context, "Credentials saved", Toast.LENGTH_SHORT).show()
            },
            if (style == EnvStyle.FORM) {
                // In Form style the fields are the editor, so a pasted `.env` block is
                // merged into the file instead of replacing text the user cannot see.
                "Paste env" to {
                    clipboard.getText()?.text?.let { pasted ->
                        text = ModelEnvFile.merge(text, pasted)
                    }
                }
            } else {
                "Paste" to { clipboard.getText()?.text?.let { text = it } }
            },
        )
    }
}

@Composable
private fun ModelEnvFields(
    text: String,
    apiKeyVisible: Boolean,
    onToggleApiKey: () -> Unit,
    onChange: (String, String) -> Unit,
) {
    val values = remember(text) { ModelEnvFile.parse(text).entries }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ModelEnvFile.FIELDS.forEach { field ->
            val secret = field.kind == ModelEnvFile.Field.Kind.SECRET
            val trailing: (@Composable () -> Unit)? = if (!secret) {
                null
            } else {
                {
                    IconButton(onClick = onToggleApiKey) {
                        Icon(
                            if (apiKeyVisible) {
                                Icons.Filled.VisibilityOff
                            } else {
                                Icons.Filled.Visibility
                            },
                            contentDescription = if (apiKeyVisible) "Hide API key" else "Show API key",
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
            OutlinedTextField(
                value = values[field.key] ?: "",
                onValueChange = { onChange(field.key, it) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(field.key, fontSize = 11.sp) },
                placeholder = { Text(field.placeholder, fontSize = 12.sp) },
                textStyle = MaterialTheme.typography.bodySmall,
                visualTransformation = if (secret && !apiKeyVisible) {
                    PasswordVisualTransformation()
                } else {
                    VisualTransformation.None
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = when (field.kind) {
                        ModelEnvFile.Field.Kind.SECRET -> KeyboardType.Password
                        ModelEnvFile.Field.Kind.URL -> KeyboardType.Uri
                        else -> KeyboardType.Text
                    },
                ),
                trailingIcon = trailing,
            )
        }
    }
}

/** Live readiness line: the Form should not let a half-configured agent look done. */
@Composable
private fun CredentialsStatus(missing: List<String>) {
    if (missing.isEmpty()) {
        Text(
            "Ready: the agent has a model, a base URL and an API key.",
            style = MaterialTheme.typography.bodySmall,
            color = MidsceneColors.SuccessText,
        )
    } else {
        Text(
            "Still missing: " + missing.joinToString(", "),
            style = MaterialTheme.typography.bodySmall,
            color = MidsceneColors.Error,
        )
    }
}


// -------------------------------------------------------------- onboarding

private const val STEP_COUNT = 4

/**
 * First-run guide.
 *
 * Authorization is the one part of the setup that cannot be automated: Shizuku
 * only shows its dialog when the app asks for it, the overlay and battery
 * exemptions are system screens, and provisioning needs the shell channel those
 * grants unlock. So the app walks through them in order, shows the live state of
 * each one, and only then hands over the console.
 */
@Composable
private fun Onboarding(onDone: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var step by remember { mutableStateOf(0) }
    var tick by remember { mutableStateOf(0) }
    val lines = remember { mutableStateListOf<String>() }

    // Re-read the statuses whenever the user comes back from a system screen.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                tick++
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    DisposableEffect(Unit) {
        val listener = AgentService.LogListener { line ->
            lines.add(line)
            if (lines.size > 60) lines.removeAt(0)
        }
        AgentService.addListener(listener)
        onDispose { AgentService.removeListener(listener) }
    }

    val shizukuReady = remember(tick) { ShizukuAuth.authorized() }
    val overlayReady = remember(tick) { OverlayView.canDraw(context) }
    val batteryReady = remember(tick) {
        context.getSystemService(android.os.PowerManager::class.java)
            ?.isIgnoringBatteryOptimizations(context.packageName) == true
    }
    val runtimeReady = remember(tick) {
        File(Provisioner.nodePath(context)).exists() &&
            Provisioner.cliFile(context).exists() &&
            File(Provisioner.YADB_TARGET).exists()
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column {
            Text("Welcome to Midscene", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                "Four quick steps and the phone can run tasks by itself.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        StepCard(
            index = 1,
            title = "Let Midscene control the phone",
            body = "Midscene uses Shizuku to tap, type and read the screen. Shizuku has to be " +
                "running, and this app needs your permission.",
            done = shizukuReady,
            current = step == 0,
            actionLabel = when {
                !ShizukuAuth.installed(context) -> "Get Shizuku"
                !ShizukuAuth.binderReady() -> "Open Shizuku"
                else -> "Authorize"
            },
            onAction = {
                when {
                    !ShizukuAuth.installed(context) ->
                        context.startActivity(
                            Intent(
                                Intent.ACTION_VIEW,
                                android.net.Uri.parse("https://shizuku.rikka.app/"),
                            ),
                        )
                    !ShizukuAuth.binderReady() -> openShizuku(context)
                    else -> ShizukuAuth.request { tick++ }
                }
            },
            hint = if (shizukuReady) "Authorized"
            else if (!ShizukuAuth.binderReady()) "Shizuku is not running yet"
            else "Waiting for your permission",
        )

        StepCard(
            index = 2,
            title = "Allow the progress bubble",
            body = "A small floating pill shows what the agent is doing. It hides itself " +
                "whenever the agent takes a screenshot, so it never appears in reports.",
            done = overlayReady,
            current = step == 1,
            actionLabel = "Allow overlay",
            onAction = { Overlay.requestPermission(context) },
            hint = if (overlayReady) "Granted" else "Not granted yet",
        )

        StepCard(
            index = 3,
            title = "Keep long tasks alive",
            body = "Exempting Midscene from battery optimisation lets a run continue while the " +
                "screen is off or the app is in the background.",
            done = batteryReady,
            current = step == 2,
            actionLabel = "Exempt from battery limits",
            onAction = { Battery.requestExemption(context) },
            hint = if (batteryReady) "Exempt" else "Still optimised",
        )

        StepCard(
            index = 4,
            title = "Install the agent runtime",
            body = "Unpacks Node, the Midscene agent and the input helper onto the device.",
            done = runtimeReady,
            current = step == 3,
            actionLabel = if (runtimeReady) "Re-provision" else "Install now",
            onAction = { AgentService.start(context, AgentService.ACTION_PROVISION, null) },
            hint = if (runtimeReady) "Ready" else "Needs step 1 first",
        )

        if (lines.isNotEmpty()) {
            Card(
                shape = MaterialTheme.shapes.medium,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(0.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(14.dp).height(140.dp).verticalScroll(rememberScrollState())) {
                    lines.takeLast(40).forEach {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(
                onClick = { if (step < STEP_COUNT) step++ else onDone() },
                shape = MaterialTheme.shapes.small,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MidsceneColors.Brand,
                    contentColor = Color.White,
                ),
                modifier = Modifier.weight(1f),
            ) {
                Text(if (step < STEP_COUNT - 1) "Next" else "Start using Midscene")
            }
            if (step > 0) {
                OutlinedButton(
                    onClick = { step-- },
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.weight(0.5f),
                ) { Text("Back") }
            }
        }
        TextButton(onClick = onDone, modifier = Modifier.fillMaxWidth()) {
            Text("Skip setup", fontSize = 12.sp)
        }
    }
}

@Composable
private fun StepCard(
    index: Int,
    title: String,
    body: String,
    done: Boolean,
    current: Boolean,
    actionLabel: String,
    onAction: () -> Unit,
    hint: String,
) {
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = if (current) MaterialTheme.colorScheme.surface
            else MaterialTheme.colorScheme.surfaceVariant,
        ),
        elevation = CardDefaults.cardElevation(0.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(22.dp).clip(CircleShape).background(
                        if (done) MidsceneColors.Success
                        else if (current) MidsceneColors.Brand
                        else MaterialTheme.colorScheme.outlineVariant,
                    ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (done) "\u2713" else index.toString(),
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Spacer(Modifier.width(10.dp))
                Text(title, style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    hint,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (done) MidsceneColors.SuccessText
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!done) {
                    Button(
                        onClick = onAction,
                        shape = MaterialTheme.shapes.small,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MidsceneColors.Brand,
                            contentColor = Color.White,
                        ),
                    ) { Text(actionLabel, fontSize = 12.sp) }
                }
            }
        }
    }
}

// ----------------------------------------------------------------- helpers

@Composable
private fun SectionLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

private object ThemePrefs {
    private const val FILE = "midscene-ui"
    private const val KEY = "dark"

    fun isDark(context: android.content.Context, systemDefault: Boolean): Boolean =
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
            .getBoolean(KEY, systemDefault)

    fun setDark(context: android.content.Context, dark: Boolean) {
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
            .edit().putBoolean(KEY, dark).apply()
    }
}

/** UI preferences shared with the service (same file and keys). */
/** Shizuku authorization, done properly: only requestPermission() raises the dialog. */
private object ShizukuAuth {
    private const val REQUEST_CODE = 4210

    fun authorized(): Boolean = try {
        !Shizuku.isPreV11() &&
            Shizuku.pingBinder() &&
            Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
    } catch (error: Throwable) {
        false
    }

    fun binderReady(): Boolean = try {
        Shizuku.pingBinder()
    } catch (error: Throwable) {
        false
    }

    fun installed(context: android.content.Context): Boolean =
        context.packageManager.getLaunchIntentForPackage("moe.shizuku.privileged.api") != null

    fun request(onResult: (Boolean) -> Unit) {
        Shizuku.addRequestPermissionResultListener { _, grantResult ->
            onResult(grantResult == PackageManager.PERMISSION_GRANTED)
        }
        try {
            Shizuku.requestPermission(REQUEST_CODE)
        } catch (error: Throwable) {
            onResult(false)
        }
    }
}

private object SetupPrefs {
    private const val FILE = "midscene-ui"
    private const val ONBOARDED_KEY = "onboarded"
    private const val RETURN_KEY = "returnAfterRun"

    fun returnAfterRun(context: android.content.Context): Boolean =
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
            .getBoolean(RETURN_KEY, true)

    fun setReturnAfterRun(context: android.content.Context, value: Boolean) {
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
            .edit().putBoolean(RETURN_KEY, value).apply()
    }

    private const val INSTRUCTION_KEY = "lastInstruction"
    private const val RECENT_KEY = "recentInstructions"
    private const val ENV_STYLE_KEY = "modelEnvStyle"

    /** Last credentials editor style; the Form is the friendlier default on a phone. */
    fun envStyle(context: android.content.Context, fallback: EnvStyle): EnvStyle =
        when (
            context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
                .getString(ENV_STYLE_KEY, null)
        ) {
            EnvStyle.ENV.name -> EnvStyle.ENV
            EnvStyle.FORM.name -> EnvStyle.FORM
            else -> fallback
        }

    fun setEnvStyle(context: android.content.Context, style: EnvStyle) {
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
            .edit().putString(ENV_STYLE_KEY, style.name).apply()
    }

    fun lastInstruction(context: android.content.Context): String =
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
            .getString(INSTRUCTION_KEY, "") ?: ""

    fun rememberInstruction(context: android.content.Context, prompt: String) {
        if (prompt.isBlank()) {
            return
        }
        val prefs = context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
        prefs.edit().putString(INSTRUCTION_KEY, prompt).apply()
        val recent = recentInstructions(context).filter { it != prompt }.toMutableList()
        recent.add(0, prompt)
        prefs.edit().putString(RECENT_KEY, recent.take(8).joinToString("\n")).apply()
    }

    fun recentInstructions(context: android.content.Context): List<String> =
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
            .getString(RECENT_KEY, "")
            ?.split("\n")
            ?.filter { it.isNotBlank() }
            ?: emptyList()

    fun onboarded(context: android.content.Context): Boolean =
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
            .getBoolean(ONBOARDED_KEY, false)

    fun setOnboarded(context: android.content.Context, value: Boolean) {
        context.getSharedPreferences(FILE, android.content.Context.MODE_PRIVATE)
            .edit().putBoolean(ONBOARDED_KEY, value).apply()
    }
}

private object Battery {
    fun requestExemption(context: android.content.Context) {
        val power = context.getSystemService(android.os.PowerManager::class.java)
        if (power != null && power.isIgnoringBatteryOptimizations(context.packageName)) {
            return
        }
        runCatching {
            context.startActivity(
                Intent(
                    android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    android.net.Uri.parse("package:${context.packageName}"),
                ),
            )
        }.onFailure {
            context.startActivity(Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }
}

private object Overlay {
    fun requestPermission(context: android.content.Context) {
        context.startActivity(
            Intent(
                android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:${context.packageName}"),
            ),
        )
    }
}

private fun openShizuku(context: android.content.Context) {
    context.packageManager.getLaunchIntentForPackage("moe.shizuku.privileged.api")
        ?.let(context::startActivity)
}

/** Extras understood by this activity when the service brings it forward. */
const val EXTRA_OPEN_HISTORY = "openHistory"

/**
 * The self-check script, worded for the form factor this device is using; the copy lives
 * in [SelfCheckScript] so the wording rules are unit-tested.
 */
private fun selfCheckConfig(context: android.content.Context): String {
    // The same width test the shell uses to pick a navigation rail over a bottom bar.
    val wide = context.resources.configuration.screenWidthDp >= 600
    return SelfCheckScript.config(wide, Provisioner.channelDir(context).absolutePath)
}
