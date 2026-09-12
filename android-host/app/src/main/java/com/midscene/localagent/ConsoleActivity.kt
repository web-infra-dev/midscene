package com.midscene.localagent

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.midscene.localagent.ui.theme.MidsceneColors
import com.midscene.localagent.ui.theme.MidsceneTheme
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ShizukuExecBridge.ensureBound(this)
        ExecBridge.start(this)
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
    Destination("Diagnostics", Icons.Filled.Build),
    Destination("Settings", Icons.Filled.Settings),
)

@Composable
private fun ConsoleShell(dark: Boolean, onDarkChange: (Boolean) -> Unit) {
    var tab by remember { mutableStateOf(0) }
    val wide = LocalConfiguration.current.screenWidthDp >= 600

    if (wide) {
        Row(Modifier.fillMaxSize()) {
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
            Screen(tab, dark, onDarkChange)
        }
    } else {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) { Screen(tab, dark, onDarkChange) }
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

@Composable
private fun Screen(tab: Int, dark: Boolean, onDarkChange: (Boolean) -> Unit) {
    when (tab) {
        1 -> ScriptsScreen()
        2 -> HistoryScreen()
        3 -> DiagnosticsScreen()
        4 -> SettingsScreen(dark, onDarkChange)
        else -> RunScreen()
    }
}

// --------------------------------------------------------------------- run

@Composable
private fun RunScreen() {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var prompt by remember { mutableStateOf("") }
    val lines = remember { mutableStateListOf<String>() }
    var busy by remember { mutableStateOf(AgentService.isBusy()) }

    DisposableEffect(Unit) {
        val listener = AgentService.LogListener { line ->
            lines.add(line)
            if (lines.size > 400) lines.removeAt(0)
            busy = AgentService.isBusy()
        }
        AgentService.addListener(listener)
        lines.clear()
        lines.addAll(AgentService.logBuffer())
        onDispose { AgentService.removeListener(listener) }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        HeroHeader(busy)
        Card(
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(0.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(16.dp)) {
                SectionLabel("INSTRUCTION")
                Spacer(Modifier.height(10.dp))
                Box(
                    Modifier.fillMaxWidth().height(104.dp)
                        .clip(MaterialTheme.shapes.small)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(12.dp),
                ) {
                    if (prompt.isEmpty()) {
                        Text(
                            "例如：打开设置并搜索 Wi-Fi",
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
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = {
                        clipboard.getText()?.text?.let { text ->
                            if (text.isNotBlank()) {
                                prompt = if (prompt.isBlank()) text else "$prompt $text"
                            }
                        }
                    }) { Text("Paste", fontSize = 12.sp) }
                    TextButton(onClick = { prompt = "" }) { Text("Clear", fontSize = 12.sp) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = {
                            AgentService.start(
                                context,
                                AgentService.ACTION_RUN_PROMPT,
                                Intent().putExtra(AgentService.EXTRA_PROMPT, prompt.trim()),
                            )
                            prompt = ""
                            busy = true
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
                            busy = false
                        },
                        enabled = busy,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.weight(0.6f),
                    ) { Text("Stop") }
                }
            }
        }
        LogCard("LIVE LOG", lines) { lines.clear() }
    }
}

@Composable
private fun HeroHeader(busy: Boolean) {
    Card(
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(
            containerColor = if (busy) MidsceneColors.Brand else MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(0.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                "Midscene",
                style = MaterialTheme.typography.headlineSmall,
                color = if (busy) Color.White else MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                if (busy) "Working on your instruction…" else "Describe a task, the phone does the rest",
                style = MaterialTheme.typography.bodyMedium,
                color = if (busy) Color.White.copy(alpha = 0.9f)
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun LogCard(title: String, lines: List<String>, onClear: () -> Unit) {
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(0.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SectionLabel(title)
                TextButton(onClick = onClear) { Text("Clear", fontSize = 12.sp) }
            }
            Spacer(Modifier.height(6.dp))
            Column(Modifier.height(200.dp).verticalScroll(rememberScrollState())) {
                if (lines.isEmpty()) {
                    Text(
                        "Nothing yet — run an instruction to see progress here.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                lines.takeLast(200).forEach {
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

// ----------------------------------------------------------------- scripts

@Composable
private fun ScriptsScreen() {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val file = remember { File(context.filesDir, "config.yaml") }
    var text by remember { mutableStateOf(ShellRunner.readText(file)) }
    var status by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Scripts", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "config.yaml — tasks run in order",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
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
                    onValueChange = { text = it },
                    textStyle = MaterialTheme.typography.bodySmall.copy(
                        color = MaterialTheme.colorScheme.onSurface,
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
                modifier = Modifier.weight(1f),
            ) { Text("Run") }
            OutlinedButton(
                onClick = { file.writeText(text); status = "saved" },
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.weight(1f),
            ) { Text("Save") }
            OutlinedButton(
                onClick = { text = ShellRunner.readText(file); status = "reloaded" },
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.weight(1f),
            ) { Text("Reload") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = {
                clipboard.getText()?.text?.let { text = it }
            }) { Text("Paste", fontSize = 12.sp) }
            TextButton(onClick = {
                // A minimal, valid starting point for a new script.
                text = "name: phone-task\ndevice:\n  backend: rish\n  rishPath: /data/local/tmp/rish\n" +
                    "  yadbPath: /data/local/tmp/yadb\n  fileChannelDir: " +
                    Provisioner.channelDir(context).absolutePath +
                    "\nagent:\n  generateReport: true\n  resetToHome: true\n  controllerPackage: " +
                    context.packageName + "\n  reportDir: ./midscene_run/results\ntasks:\n" +
                    "  - name: open-settings\n    type: aiAct\n    prompt: open the settings app\n"
                status = "template loaded"
            }) { Text("New template", fontSize = 12.sp) }
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

// ----------------------------------------------------------------- history

@Composable
private fun HistoryScreen() {
    val context = LocalContext.current
    val store = remember { RunStore(context.filesDir) }
    var records by remember { mutableStateOf(store.list()) }
    var selected by remember { mutableStateOf<RunStore.RunRecord?>(null) }
    val wide = LocalConfiguration.current.screenWidthDp >= 600

    LaunchedEffect(Unit) { records = store.list() }

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
                items(records) { record ->
                    RunCard(record, selected?.id == record.id) { selected = record }
                }
            }
            Box(Modifier.weight(1f).fillMaxHeight().padding(16.dp)) {
                val current = selected
                if (current == null) {
                    EmptyHint("Select a run to see its log and report")
                } else {
                    RunDetail(current, store, onOpen = ::open)
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
        items(records) { record -> RunCard(record, false) { selected = record } }
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

@Composable
private fun RunCard(record: RunStore.RunRecord, highlighted: Boolean, onClick: () -> Unit) {
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = if (highlighted) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(0.dp),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(10.dp).clip(CircleShape)
                    .background(if (record.ok) MidsceneColors.Success else MidsceneColors.Error),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    record.configName.ifEmpty { "run" },
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    buildString {
                        append(SimpleDateFormat("MM-dd HH:mm", Locale.US).format(Date(record.startedAt)))
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
            val hasReport = record.reportFile.isNotEmpty() && File(record.reportFile).exists()
            Text(
                if (hasReport) "Report" else "Log",
                style = MaterialTheme.typography.labelSmall,
                color = MidsceneColors.Brand,
            )
        }
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
            ActionRow(
                "Provision" to { AgentService.start(context, AgentService.ACTION_PROVISION, null) },
                "Authorize" to { AgentService.start(context, AgentService.ACTION_PROVISION, null) },
            )
        }
        DiagnosticsCard("DEVICE") {
            ActionRow(
                "Battery" to { Battery.requestExemption(context) },
                "Shizuku" to { openShizuku(context) },
                "Overlay" to { Overlay.requestPermission(context) },
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
private fun ActionRow(vararg actions: Pair<String, () -> Unit>) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        actions.forEach { (label, action) ->
            OutlinedButton(
                onClick = action,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.weight(1f),
            ) { Text(label, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

// ---------------------------------------------------------------- settings

@Composable
private fun SettingsScreen(dark: Boolean, onDarkChange: (Boolean) -> Unit) {
    val context = LocalContext.current
    val file = remember { File(context.filesDir, "model.env") }
    var text by remember {
        mutableStateOf(
            ShellRunner.readText(file).ifEmpty {
                "MIDSCENE_MODEL_API_KEY=\nMIDSCENE_MODEL_BASE_URL=\nMIDSCENE_MODEL_NAME=\nMIDSCENE_MODEL_FAMILY=\n"
            },
        )
    }
    var overlayOn by remember { mutableStateOf(OverlayView.canDraw(context)) }
    val clipboard = LocalClipboardManager.current

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall)

        DiagnosticsCard("APPEARANCE") {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Dark theme", style = MaterialTheme.typography.bodyMedium)
                Switch(checked = dark, onCheckedChange = onDarkChange)
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

        DiagnosticsCard("MODEL CREDENTIALS") {
            Text(
                "Kept in the app's private storage and injected into the agent process; never written into a script.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
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
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Spacer(Modifier.height(10.dp))
            ActionRow(
                "Save" to {
                    file.writeText(text)
                    OverlayView.show(context, "Credentials saved")
                },
                "Paste" to { clipboard.getText()?.text?.let { text = it } },
            )
        }

        DiagnosticsCard("ABOUT") {
            Text(
                "Midscene on-device agent · ${Provisioner.nodePath(context).substringAfterLast('/')}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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
