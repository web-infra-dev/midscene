package com.midscene.localagent;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.method.ScrollingMovementMethod;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Production console for the on-device agent.
 *
 * Four tabs mirror what a desktop studio session offers minus the live preview:
 * run a natural-language instruction, manage YAML scripts, browse run history
 * with reports, and configure the runtime plus model credentials. Execution is
 * delegated to {@link AgentService} so it survives this UI being reclaimed.
 */
public class MainActivity extends Activity implements AgentService.LogListener {

    private static final int REQUEST_NOTIFICATIONS = 42;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView statusView;
    private TextView logView;
    private EditText promptInput;
    private EditText configEditor;
    private EditText modelEditor;
    private TextView historyView;
    private LinearLayout[] pages;
    private RunStore runStore;
    private boolean configDirty;
    private boolean loadingText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        runStore = new RunStore(getFilesDir());
        setContentView(buildLayout());
        requestNotificationPermissionIfNeeded();
        loadConfigEditor();
        loadModelEditor();
        refreshStatus();
        for (String line : AgentService.logBuffer()) {
            appendLog(line);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        AgentService.addListener(this);
        refreshStatus();
        refreshHistory();
    }

    @Override
    protected void onPause() {
        super.onPause();
        AgentService.removeListener(this);
    }

    @Override
    public void onLog(String line) {
        ui.post(() -> appendLog(line));
    }

    // ---------------------------------------------------------------- layout

    private View buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        LinearLayout tabBar = new LinearLayout(this);
        tabBar.setOrientation(LinearLayout.HORIZONTAL);
        String[] titles = {"Run", "Scripts", "History", "Setup"};
        pages = new LinearLayout[titles.length];
        for (int index = 0; index < titles.length; index++) {
            final int tabIndex = index;
            Button tab = new Button(this);
            tab.setText(titles[index]);
            tab.setAllCaps(false);
            tab.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
            tab.setOnClickListener(view -> showTab(tabIndex));
            tabBar.addView(tab, new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        }
        root.addView(tabBar);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        for (int index = 0; index < titles.length; index++) {
            LinearLayout page = buildPage(index);
            page.setVisibility(index == 0 ? View.VISIBLE : View.GONE);
            pages[index] = page;
            content.addView(page, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        root.addView(content, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        return root;
    }

    private LinearLayout buildPage(int index) {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(10);
        page.setPadding(pad, pad, pad, pad);

        switch (index) {
            case 0:
                buildRunPage(page);
                break;
            case 1:
                buildScriptsPage(page);
                break;
            case 2:
                buildHistoryPage(page);
                break;
            default:
                buildSetupPage(page);
                break;
        }
        return page;
    }

    private void buildRunPage(LinearLayout page) {
        statusView = new TextView(this);
        statusView.setTypeface(Typeface.MONOSPACE);
        statusView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        statusView.setTextColor(Color.DKGRAY);
        page.addView(statusView);

        promptInput = new EditText(this);
        promptInput.setHint("Natural language instruction, e.g. 打开设置并搜索 Wi-Fi");
        promptInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        promptInput.setMinLines(2);
        page.addView(promptInput);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        addButton(row, "Run instruction", view -> runInstruction());
        addButton(row, "Stop", view -> AgentService.start(this, AgentService.ACTION_STOP, null));
        addButton(row, "Clear log", view -> logView.setText(""));
        page.addView(row);

        logView = new TextView(this);
        logView.setTypeface(Typeface.MONOSPACE);
        logView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        logView.setMovementMethod(new ScrollingMovementMethod());
        ScrollView scroll = new ScrollView(this);
        scroll.addView(logView);
        page.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
    }

    private void buildScriptsPage(LinearLayout page) {
        TextView hint = new TextView(this);
        hint.setText("config.yaml — tasks run in order; script tasks may reference files in files/scripts.");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        page.addView(hint);

        configEditor = new EditText(this);
        configEditor.setTypeface(Typeface.MONOSPACE);
        configEditor.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        configEditor.setGravity(Gravity.TOP | Gravity.START);
        configEditor.addTextChangedListener(new SimpleWatcher(() -> {
            if (!loadingText) {
                configDirty = true;
            }
        }));
        ScrollView scroll = new ScrollView(this);
        scroll.addView(configEditor);
        page.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        addButton(row, "Save", view -> saveConfig(true));
        addButton(row, "Run config", view -> runConfig());
        addButton(row, "Reload", view -> loadConfigEditor());
        page.addView(row);
    }

    private void buildHistoryPage(LinearLayout page) {
        TextView hint = new TextView(this);
        hint.setText("Tap a run to open its log or HTML report.");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        page.addView(hint);

        historyView = new TextView(this);
        historyView.setTypeface(Typeface.MONOSPACE);
        historyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        historyView.setPadding(0, dp(8), 0, dp(8));
        ScrollView scroll = new ScrollView(this);
        scroll.addView(historyView);
        page.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        addButton(row, "Refresh", view -> refreshHistory());
        page.addView(row);
    }

    private void buildSetupPage(LinearLayout page) {
        TextView hint = new TextView(this);
        hint.setText("Runtime and credentials. model.env keeps the API key out of the visible config.");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        page.addView(hint);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        addButton(row, "Provision runtime", view ->
                AgentService.start(this, AgentService.ACTION_PROVISION, null));
        addButton(row, "Check state", view -> refreshStatus());
        page.addView(row);

        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        addButton(row2, "Battery exemption", view -> requestBatteryExemption());
        addButton(row2, "Open Shizuku", view -> openShizuku());
        page.addView(row2);

        modelEditor = new EditText(this);
        modelEditor.setTypeface(Typeface.MONOSPACE);
        modelEditor.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        modelEditor.setGravity(Gravity.TOP | Gravity.START);
        modelEditor.setMinLines(4);
        page.addView(modelEditor);

        LinearLayout row3 = new LinearLayout(this);
        row3.setOrientation(LinearLayout.HORIZONTAL);
        addButton(row3, "Save model.env", view -> saveModelEnv());
        addButton(row3, "Run doctor", view -> runDoctor());
        page.addView(row3);
    }

    private void addButton(LinearLayout parent, String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        button.setOnClickListener(listener);
        parent.addView(button, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void showTab(int index) {
        for (int i = 0; i < pages.length; i++) {
            pages[i].setVisibility(i == index ? View.VISIBLE : View.GONE);
        }
        if (index == 2) {
            refreshHistory();
        } else if (index == 3) {
            refreshStatus();
        }
    }

    // ----------------------------------------------------------------- runs

    private void runInstruction() {
        String prompt = promptInput.getText().toString().trim();
        if (prompt.isEmpty()) {
            toast("Enter an instruction first");
            return;
        }
        Intent extras = new Intent().putExtra(AgentService.EXTRA_PROMPT, prompt);
        AgentService.start(this, AgentService.ACTION_RUN_PROMPT, extras);
        showTab(0);
    }

    private void runConfig() {
        saveConfig(false);
        AgentService.start(this, AgentService.ACTION_RUN_CONFIG,
                new Intent().putExtra(AgentService.EXTRA_CONFIG_PATH,
                        new File(getFilesDir(), "config.yaml").getAbsolutePath()));
        showTab(0);
    }

    /** A one-task config that exercises perception plus a model round trip. */
    private void runDoctor() {
        saveModelEnv();
        String yaml = "name: doctor\n"
                + "device:\n  backend: rish\n  displayId: 0\n  rishPath: /data/local/tmp/rish\n"
                + "agent:\n  generateReport: false\n"
                + "tasks:\n  - name: describe-screen\n    type: aiQuery\n"
                + "    prompt: describe what is currently visible on screen in one sentence\n";
        try {
            Files.write(new File(getFilesDir(), "doctor.yaml").toPath(),
                    yaml.getBytes(StandardCharsets.UTF_8));
        } catch (IOException error) {
            appendLog("could not write doctor config: " + error);
            return;
        }
        AgentService.start(this, AgentService.ACTION_RUN_CONFIG,
                new Intent().putExtra(AgentService.EXTRA_CONFIG_PATH,
                        new File(getFilesDir(), "doctor.yaml").getAbsolutePath()));
    }

    // --------------------------------------------------------------- config

    private void loadConfigEditor() {
        String text = ShellRunner.readText(new File(getFilesDir(), "config.yaml"));
        if (text.isEmpty()) {
            text = defaultConfig();
        }
        loadingText = true;
        try {
            configEditor.setText(text);
            configDirty = false;
        } finally {
            loadingText = false;
        }
    }

    private String defaultConfig() {
        return "name: phone-task\n"
                + "device:\n"
                + "  backend: rish\n"
                + "  displayId: 0\n"
                + "  rishPath: /data/local/tmp/rish\n"
                + "  yadbPath: /data/local/tmp/yadb\n"
                + "agent:\n"
                + "  generateReport: true\n"
                + "  reportDir: ./midscene_run/results\n"
                + "tasks:\n"
                + "  - name: open-settings\n"
                + "    type: aiAct\n"
                + "    prompt: open the settings app\n"
                + "  - name: settings-visible\n"
                + "    type: aiAssert\n"
                + "    prompt: the settings screen is visible\n";
    }

    private void saveConfig(boolean notify) {
        if (!configDirty) {
            if (notify) {
                toast("Config unchanged");
            }
            return;
        }
        try (FileOutputStream out = new FileOutputStream(new File(getFilesDir(), "config.yaml"))) {
            out.write(configEditor.getText().toString().getBytes(StandardCharsets.UTF_8));
            configDirty = false;
            if (notify) {
                toast("Config saved");
            }
        } catch (IOException error) {
            appendLog("could not save config: " + error);
        }
    }

    private void loadModelEditor() {
        String text = ShellRunner.readText(new File(getFilesDir(), "model.env"));
        if (text.isEmpty()) {
            text = "MIDSCENE_MODEL_API_KEY=\nMIDSCENE_MODEL_BASE_URL=\n"
                    + "MIDSCENE_MODEL_NAME=\nMIDSCENE_MODEL_FAMILY=\n";
        }
        loadingText = true;
        try {
            modelEditor.setText(text);
        } finally {
            loadingText = false;
        }
    }

    private void saveModelEnv() {
        try (FileOutputStream out = new FileOutputStream(new File(getFilesDir(), "model.env"))) {
            out.write(modelEditor.getText().toString().getBytes(StandardCharsets.UTF_8));
            toast("model.env saved");
        } catch (IOException error) {
            appendLog("could not save model.env: " + error);
        }
    }

    // -------------------------------------------------------------- history

    private void refreshHistory() {
        List<RunStore.RunRecord> records = runStore.list();
        if (records.isEmpty()) {
            historyView.setText("No runs yet.");
            historyView.setOnClickListener(null);
            historyView.setClickable(false);
            return;
        }

        StringBuilder text = new StringBuilder();
        SimpleDateFormat format = new SimpleDateFormat("MM-dd HH:mm", Locale.US);
        for (RunStore.RunRecord record : records) {
            text.append(record.ok ? "OK  " : "ERR ")
                    .append(format.format(new Date(record.startedAt)))
                    .append("  ").append(record.configName)
                    .append("  ").append(record.durationMs / 1000).append("s")
                    .append("  tasks=").append(record.taskCount - record.failedTasks)
                    .append("/").append(record.taskCount)
                    .append('\n');
        }

        historyView.setText(text.toString());
        historyView.setClickable(true);
        historyView.setOnClickListener(view -> showRunPicker(records));
    }

    private void showRunPicker(List<RunStore.RunRecord> records) {
        String[] labels = new String[records.size()];
        SimpleDateFormat format = new SimpleDateFormat("MM-dd HH:mm:ss", Locale.US);
        for (int index = 0; index < records.size(); index++) {
            RunStore.RunRecord record = records.get(index);
            labels[index] = (record.ok ? "OK " : "ERR ")
                    + format.format(new Date(record.startedAt)) + " · " + record.configName;
        }

        new AlertDialog.Builder(this)
                .setTitle("Open run")
                .setItems(labels, (dialog, which) -> showRunDetail(records.get(which)))
                .show();
    }

    private void showRunDetail(RunStore.RunRecord record) {
        JSONObject result = runStore.readResult(record);
        StringBuilder summary = new StringBuilder();
        summary.append("config: ").append(record.configName).append('\n');
        summary.append("duration: ").append(record.durationMs / 1000).append(" s\n");
        summary.append("exit: ").append(record.exitCode).append('\n');
        JSONArray tasks = result == null ? null : result.optJSONArray("tasks");
        if (tasks != null) {
            for (int index = 0; index < tasks.length(); index++) {
                JSONObject task = tasks.optJSONObject(index);
                if (task == null) {
                    continue;
                }
                summary.append("• ").append(task.optString("name"))
                        .append(" [").append(task.optString("type")).append("] ")
                        .append(task.optString("status"))
                        .append("  ").append(task.optLong("ms") / 1000).append("s");
                String error = task.optString("error", "");
                if (!error.isEmpty()) {
                    summary.append("\n    ").append(error.replace('\n', ' '));
                }
                summary.append('\n');
            }
        }

        boolean hasReport = record.reportFile != null && !record.reportFile.isEmpty()
                && new File(record.reportFile).exists();

        new AlertDialog.Builder(this)
                .setTitle(record.ok ? "Run succeeded" : "Run reported errors")
                .setMessage(summary.toString())
                .setPositiveButton(hasReport ? "Report" : "Log", (dialog, which) -> {
                    if (hasReport) {
                        openViewer("Run report", record.reportFile, true);
                    } else {
                        openViewer("Run log", record.logFile, false);
                    }
                })
                .setNeutralButton("Log", (dialog, which) ->
                        openViewer("Run log", record.logFile, false))
                .setNegativeButton("Close", null)
                .show();
    }

    private void openViewer(String title, String path, boolean html) {
        if (path == null || path.isEmpty()) {
            toast("Nothing to open");
            return;
        }
        startActivity(new Intent(this, ReportViewerActivity.class)
                .putExtra(ReportViewerActivity.EXTRA_TITLE, title)
                .putExtra(ReportViewerActivity.EXTRA_PATH, path)
                .putExtra(ReportViewerActivity.EXTRA_HTML, html));
    }

    // ----------------------------------------------------------- permissions

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    REQUEST_NOTIFICATIONS);
        }
    }

    /**
     * Surviving doze for a user-initiated long task is a legitimate use of the
     * battery optimisation exemption, so ask for it through the system dialog
     * instead of relying on adb-only privileges.
     */
    private void requestBatteryExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }
        PowerManager power = getSystemService(PowerManager.class);
        if (power != null && power.isIgnoringBatteryOptimizations(getPackageName())) {
            toast("Already exempt from battery optimization");
            return;
        }
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception error) {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    private void openShizuku() {
        Intent intent = getPackageManager().getLaunchIntentForPackage(
                "moe.shizuku.privileged.api");
        if (intent == null) {
            toast("Shizuku is not installed");
            return;
        }
        startActivity(intent);
    }

    // -------------------------------------------------------------- helpers

    private void refreshStatus() {
        StringBuilder text = new StringBuilder();
        text.append("state: ").append(AgentService.state).append('\n');
        text.append("node: ").append(new File(Provisioner.nodePath(this)).exists()
                ? "ready" : "missing").append('\n');
        text.append("agent: ").append(Provisioner.cliFile(this).exists()
                ? "extracted" : "not extracted").append('\n');
        text.append("yadb: ").append(new File(Provisioner.YADB_TARGET).exists()
                ? "installed" : "missing (Setup → Provision runtime)").append('\n');
        if (AgentService.isBusy()) {
            text.append("running since: ").append(
                    new SimpleDateFormat("HH:mm:ss", Locale.US)
                            .format(new Date(AgentService.runStartedAt))).append('\n');
        }
        statusView.setText(text.toString());
    }

    private void appendLog(String line) {
        ui.post(() -> {
            logView.append(line + "\n");
            int scrollAmount = logView.getLayout() == null ? 0
                    : logView.getLayout().getLineTop(logView.getLineCount()) - logView.getHeight();
            if (scrollAmount > 0) {
                ((ScrollView) logView.getParent()).scrollTo(0, scrollAmount);
            }
        });
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private static class SimpleWatcher implements TextWatcher {
        private final Runnable onChange;

        SimpleWatcher(Runnable onChange) {
            this.onChange = onChange;
        }

        @Override
        public void beforeTextChanged(CharSequence s, int start, int count, int after) {
        }

        @Override
        public void onTextChanged(CharSequence s, int start, int before, int count) {
        }

        @Override
        public void afterTextChanged(Editable s) {
            onChange.run();
        }
    }
}
