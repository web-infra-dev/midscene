package com.midscene.localagent

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
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
 * Consumer-facing console.
 *
 * Three destinations only: run an instruction, review past runs, and a separate
 * diagnostics page for everything that used to clutter the main flow (runtime
 * provisioning, Shizuku authorization, battery/notification setup, model
 * credentials, device capabilities).
 */
class ConsoleActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Edge to edge (plus imePadding below) is what makes the keyboard push the
        // content instead of covering the run controls.
        enableEdgeToEdge()
        ShizukuExecBridge.ensureBound(this)
        ExecBridge.start(this)
        setContent {
            MidsceneTheme {
                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .safeDrawingPadding()
                        .imePadding(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    Console()
                }
            }
        }
    }

    @Composable
    private fun Console() {
        var tab by remember { mutableStateOf(0) }
        val context = LocalContext.current

        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                when (tab) {
                    1 -> HistoryScreen()
                    2 -> DiagnosticsScreen()
                    else -> RunScreen()
                }
            }
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                NavigationBarItem(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    icon = { Icon(Icons.Filled.Bolt, contentDescription = null) },
                    label = { Text("Run") },
                )
                NavigationBarItem(
                    selected = tab == 1,
                    onClick = { tab = 1 },
                    icon = { Icon(Icons.Filled.History, contentDescription = null) },
                    label = { Text("History") },
                )
                NavigationBarItem(
                    selected = tab == 2,
                    onClick = { tab = 2 },
                    icon = { Icon(Icons.Filled.Build, contentDescription = null) },
                    label = { Text("Diagnostics") },
                )
            }
        }
    }

    // ------------------------------------------------------------------ run

    @Composable
    private fun RunScreen() {
        val context = LocalContext.current
        var prompt by remember { mutableStateOf("") }
        val lines = remember { mutableStateListOf<String>() }
        var busy by remember { mutableStateOf(AgentService.isBusy()) }

        DisposableEffect(Unit) {
            val listener = AgentService.LogListener { line ->
                runOnUiThread {
                    lines.add(line)
                    if (lines.size > 400) lines.removeAt(0)
                    busy = AgentService.isBusy()
                }
            }
            AgentService.addListener(listener)
            lines.clear()
            lines.addAll(AgentService.logBuffer())
            onDispose { AgentService.removeListener(listener) }
        }

        val clipboard = LocalClipboardManager.current

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            HeroHeader(busy)
            InstructionCard(
                prompt = prompt,
                onPromptChange = { prompt = it },
                busy = busy,
                onRun = {
                    AgentService.start(
                        context,
                        AgentService.ACTION_RUN_PROMPT,
                        Intent().putExtra(AgentService.EXTRA_PROMPT, prompt.trim()),
                    )
                    prompt = ""
                    busy = true
                },
                onStop = {
                    AgentService.start(context, AgentService.ACTION_STOP, null)
                    busy = false
                },
                onPaste = {
                    // Explicit paste: the emulator's shared clipboard and the
                    // long-press toolbar are both unreliable while debugging.
                    clipboard.getText()?.text?.let { text ->
                        if (text.isNotBlank()) {
                            prompt = if (prompt.isBlank()) text else prompt + " " + text
                        }
                    }
                },
                onClear = { prompt = "" },
            )
            LogCard(lines) { lines.clear() }
            Spacer(Modifier.height(4.dp))
        }
    }

    @Composable
    private fun HeroHeader(busy: Boolean) {
        val accent by animateColorAsState(
            if (busy) MidsceneColors.Brand else MaterialTheme.colorScheme.surface,
            label = "hero",
        )
        Card(
            shape = MaterialTheme.shapes.large,
            colors = CardDefaults.cardColors(containerColor = accent),
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
    private fun InstructionCard(
        prompt: String,
        onPromptChange: (String) -> Unit,
        busy: Boolean,
        onRun: () -> Unit,
        onStop: () -> Unit,
        onPaste: () -> Unit,
        onClear: () -> Unit,
    ) {
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
                    Modifier
                        .fillMaxWidth()
                        .height(104.dp)
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
                        onValueChange = onPromptChange,
                        textStyle = MaterialTheme.typography.bodyMedium.copy(
                            color = MaterialTheme.colorScheme.onSurface,
                        ),
                        modifier = Modifier
                            .fillMaxSize()
                            .semantics { contentDescription = "Instruction input" },
                    )
                }
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(onClick = onPaste) { Text("Paste", fontSize = 12.sp) }
                    TextButton(onClick = onClear) { Text("Clear", fontSize = 12.sp) }
                }
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = onRun,
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
                        onClick = onStop,
                        enabled = busy,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.weight(0.6f),
                    ) {
                        Text("Stop")
                    }
                }
            }
        }
    }

    @Composable
    private fun LogCard(lines: List<String>, onClear: () -> Unit) {
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
                    SectionLabel("LIVE LOG")
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
                    lines.takeLast(200).forEach { line ->
                        Text(
                            line,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }

    // -------------------------------------------------------------- history

    @Composable
    private fun HistoryScreen() {
        val context = LocalContext.current
        val store = remember { RunStore(context.filesDir) }
        var records by remember { mutableStateOf(store.list()) }
        var selected by remember { mutableStateOf<RunStore.RunRecord?>(null) }

        LaunchedEffect(Unit) { records = store.list() }

        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text(
                    "Runs",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    "Tap a card to open its log or report",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (records.isEmpty()) {
                item {
                    Card(
                        shape = MaterialTheme.shapes.medium,
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(0.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            "No runs yet.",
                            Modifier.padding(20.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            items(records) { record ->
                RunCard(record) { selected = record }
            }
        }

        selected?.let { record ->
            RunDetailDialog(
                record = record,
                store = store,
                onDismiss = { selected = null },
                onOpen = { path, html ->
                    context.startActivity(
                        Intent(context, ReportViewerActivity::class.java)
                            .putExtra(ReportViewerActivity.EXTRA_TITLE, if (html) "Run report" else "Run log")
                            .putExtra(ReportViewerActivity.EXTRA_PATH, path)
                            .putExtra(ReportViewerActivity.EXTRA_HTML, html),
                    )
                    selected = null
                },
            )
        }
    }

    @Composable
    private fun RunCard(record: RunStore.RunRecord, onClick: () -> Unit) {
        val ok = record.ok
        Card(
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(0.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick),
        ) {
            Row(
                Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(if (ok) MidsceneColors.Success else MidsceneColors.Error),
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        record.configName.ifEmpty { "run" },
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        buildString {
                            append(
                                SimpleDateFormat("MM-dd HH:mm", Locale.US)
                                    .format(Date(record.startedAt)),
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
    private fun RunDetailDialog(
        record: RunStore.RunRecord,
        store: RunStore,
        onDismiss: () -> Unit,
        onOpen: (String, Boolean) -> Unit,
    ) {
        val hasReport = record.reportFile.isNotEmpty() && File(record.reportFile).exists()
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(if (record.ok) "Run succeeded" else "Run reported errors") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(
                        "${record.configName} · ${record.durationMs / 1000}s · exit ${record.exitCode}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    val summary = store.readLog(record)
                    Text(
                        summary.takeLast(1200).ifEmpty { "No log captured." },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            },
            confirmButton = {
                if (hasReport) {
                    TextButton(onClick = { onOpen(record.reportFile, true) }) { Text("Report") }
                }
            },
            dismissButton = {
                TextButton(onClick = { onOpen(record.logFile, false) }) { Text("Log") }
            },
        )
    }

    // ---------------------------------------------------------- diagnostics

    @Composable
    private fun DiagnosticsScreen() {
        val context = LocalContext.current
        val lines = remember { mutableStateListOf<String>() }

        DisposableEffect(Unit) {
            val listener = AgentService.LogListener { line ->
                runOnUiThread {
                    lines.add(line)
                    if (lines.size > 300) lines.removeAt(0)
                }
            }
            AgentService.addListener(listener)
            onDispose { AgentService.removeListener(listener) }
        }

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Diagnostics",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
            )

            DiagnosticsCard("RUNTIME") {
                StatusRow("node", File(Provisioner.nodePath(context)).exists())
                StatusRow("agent bundle", Provisioner.cliFile(context).exists())
                StatusRow("yadb", File(Provisioner.YADB_TARGET).exists())
                StatusRow("shizuku", ShizukuExecBridge.isReady())
                Spacer(Modifier.height(10.dp))
                ActionRow(
                    "Provision runtime" to {
                        AgentService.start(context, AgentService.ACTION_PROVISION, null)
                    },
                    "Authorize Shizuku" to {
                        AgentService.start(context, AgentService.ACTION_PROVISION, null)
                    },
                )
            }

            DiagnosticsCard("DEVICE") {
                ActionRow(
                    "Battery exemption" to { requestBatteryExemption() },
                    "Open Shizuku" to { openShizuku() },
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
            Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(
                if (ready) "ready" else "missing",
                style = MaterialTheme.typography.bodySmall,
                color = if (ready) MidsceneColors.SuccessText else MidsceneColors.Error,
            )
        }
    }

    @Composable
    private fun ActionRow(vararg actions: Pair<String, () -> Unit>) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            actions.forEach { (label, action) ->
                OutlinedButton(
                    onClick = action,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(label, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }

    @Composable
    private fun SectionLabel(text: String) {
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    private fun requestBatteryExemption() {
        val power = getSystemService(PowerManager::class.java)
        if (power != null && power.isIgnoringBatteryOptimizations(packageName)) {
            return
        }
        runCatching {
            startActivity(
                Intent(
                    android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    android.net.Uri.parse("package:$packageName"),
                ),
            )
        }.onFailure {
            startActivity(Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun openShizuku() {
        packageManager.getLaunchIntentForPackage("moe.shizuku.privileged.api")?.let(::startActivity)
    }
}

private typealias PowerManager = android.os.PowerManager
