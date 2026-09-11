package com.midscene.localagent;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.navigation.NavigationBarView;
import com.google.android.material.navigationrail.NavigationRailView;

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
 * Layout follows the desktop studio: a Material 3 shell (bottom navigation on
 * phones, side rail on tablets, both from `activity_main.xml` variants) with the
 * studio's colour tokens in `res/values/colors.xml`. The four destinations cover
 * what a studio session offers minus the live preview: a natural-language run,
 * YAML scripts, run history with reports, and runtime/credential setup.
 */
public class MainActivity extends AppCompatActivity implements AgentService.LogListener {

    private static final int REQUEST_NOTIFICATIONS = 42;
    private static final String THEME_PREFS = "midscene-theme";
    private static final String THEME_KEY = "mode";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private MaterialToolbar toolbar;
    private FrameLayout pageHost;
    private LinearLayout[] pages;
    private TextView[] pills;
    private TextView logView;
    private EditText promptInput;
    private EditText configEditor;
    private EditText modelEditor;
    private TextView historyView;
    private RunStore runStore;
    private boolean configDirty;
    private boolean loadingText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        applySavedTheme();
        super.onCreate(savedInstanceState);
        runStore = new RunStore(getFilesDir());
        setContentView(R.layout.activity_main);

        toolbar = findViewById(R.id.toolbar);
        pageHost = findViewById(R.id.page_host);
        setSupportActionBar(toolbar);

        pages = new LinearLayout[]{
                buildRunPage(),
                buildScriptsPage(),
                buildHistoryPage(),
                buildSetupPage(),
        };
        for (LinearLayout page : pages) {
            page.setVisibility(View.GONE);
            pageHost.addView(page, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }

        wireNavigation();
        showPage(0, true);
        requestNotificationPermissionIfNeeded();
        loadConfigEditor();
        loadModelEditor();
        refreshStatus();
        refreshHistory();
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

    // ------------------------------------------------------------ navigation

    private void wireNavigation() {
        NavigationBarView bottom = findViewById(R.id.bottom_nav);
        NavigationRailView rail = findViewById(R.id.rail_nav);

        if (bottom != null) {
            bottom.setOnItemSelectedListener(item -> {
                showPage(indexOf(item.getItemId()), false);
                return true;
            });
        }
        if (rail != null) {
            rail.setOnItemSelectedListener(item -> {
                showPage(indexOf(item.getItemId()), false);
                return true;
            });
        }
    }

    private void showPage(int index, boolean selectInNav) {
        for (int i = 0; i < pages.length; i++) {
            pages[i].setVisibility(i == index ? View.VISIBLE : View.GONE);
        }
        if (selectInNav) {
            NavigationBarView bottom = findViewById(R.id.bottom_nav);
            NavigationRailView rail = findViewById(R.id.rail_nav);
            int id = idOf(index);
            if (bottom != null) {
                bottom.setSelectedItemId(id);
            }
            if (rail != null) {
                rail.setSelectedItemId(id);
            }
        }
        if (index == 2) {
            refreshHistory();
        } else if (index == 3) {
            refreshStatus();
        }
    }

    private int idOf(int index) {
        switch (index) {
            case 1:
                return R.id.nav_scripts;
            case 2:
                return R.id.nav_history;
            case 3:
                return R.id.nav_setup;
            default:
                return R.id.nav_run;
        }
    }

    private int indexOf(int id) {
        if (id == R.id.nav_scripts) {
            return 1;
        }
        if (id == R.id.nav_history) {
            return 2;
        }
        if (id == R.id.nav_setup) {
            return 3;
        }
        return 0;
    }

    // ------------------------------------------------------------- building

    private LinearLayout page() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        int pad = getResources().getDimensionPixelSize(R.dimen.page_padding);
        page.setPadding(pad, pad, pad, pad);
        return page;
    }

    private MaterialCardView card(LinearLayout parent, String title) {
        MaterialCardView card = new MaterialCardView(this);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = getResources().getDimensionPixelSize(R.dimen.space_md);
        card.setLayoutParams(params);
        card.setCardBackgroundColor(getColor(R.color.surface));
        card.setStrokeColor(getColor(R.color.border_subtle));
        card.setStrokeWidth(1);
        card.setRadius(getResources().getDimensionPixelSize(R.dimen.card_radius));
        card.setCardElevation(0);

        LinearLayout inner = new LinearLayout(this);
        inner.setOrientation(LinearLayout.VERTICAL);
        int pad = getResources().getDimensionPixelSize(R.dimen.space_lg);
        inner.setPadding(pad, pad, pad, pad);
        card.addView(inner);

        if (title != null) {
            TextView label = new TextView(this);
            label.setText(title);
            label.setTypeface(Typeface.DEFAULT_BOLD);
            label.setTextSize(12);
            label.setTextColor(getColor(R.color.text_secondary));
            LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            labelParams.bottomMargin = getResources().getDimensionPixelSize(R.dimen.space_sm);
            label.setLayoutParams(labelParams);
            inner.addView(label);
        }

        parent.addView(card);
        return card;
    }

    private LinearLayout cardBody(MaterialCardView card) {
        return (LinearLayout) card.getChildAt(0);
    }

    private MaterialButton primaryButton(String label, View.OnClickListener listener) {
        MaterialButton button = new MaterialButton(this, null,
                com.google.android.material.R.attr.materialButtonOutlinedStyle);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(12);
        button.setCornerRadius(getResources().getDimensionPixelSize(R.dimen.space_sm));
        button.setOnClickListener(listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        params.setMarginEnd(getResources().getDimensionPixelSize(R.dimen.space_sm));
        button.setLayoutParams(params);
        return button;
    }

    private MaterialButton filledButton(String label, View.OnClickListener listener) {
        MaterialButton button = new MaterialButton(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(12);
        button.setCornerRadius(getResources().getDimensionPixelSize(R.dimen.space_sm));
        button.setOnClickListener(listener);
        button.setLayoutParams(new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return button;
    }

    private LinearLayout buttonRow(LinearLayout parent) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        parent.addView(row, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return row;
    }

    private EditText editor(int minLines, boolean mono) {
        EditText editor = new EditText(this);
        if (mono) {
            editor.setTypeface(Typeface.MONOSPACE);
            editor.setTextSize(11);
        } else {
            editor.setTextSize(14);
        }
        editor.setGravity(Gravity.TOP | Gravity.START);
        editor.setMinLines(minLines);
        editor.setBackgroundColor(getColor(R.color.surface_muted));
        int pad = getResources().getDimensionPixelSize(R.dimen.space_md);
        editor.setPadding(pad, pad, pad, pad);
        return editor;
    }

    private TextView pill(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(11);
        view.setPadding(
                getResources().getDimensionPixelSize(R.dimen.space_sm),
                getResources().getDimensionPixelSize(R.dimen.space_xs),
                getResources().getDimensionPixelSize(R.dimen.space_sm),
                getResources().getDimensionPixelSize(R.dimen.space_xs));
        view.setBackgroundColor(getColor(R.color.surface_muted));
        view.setTextColor(getColor(R.color.text_secondary));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMarginEnd(getResources().getDimensionPixelSize(R.dimen.space_xs));
        view.setLayoutParams(params);
        return view;
    }

    // ----------------------------------------------------------------- pages

    private LinearLayout buildRunPage() {
        LinearLayout page = page();
        ScrollView scroll = new ScrollView(this);
        scroll.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout content = page();
        scroll.addView(content);
        page.addView(scroll);

        // Status pills: one per subsystem, colour-coded like the studio badges.
        MaterialCardView statusCard = card(content, "DEVICE");
        LinearLayout statusBody = cardBody(statusCard);
        LinearLayout pillRow = new LinearLayout(this);
        pillRow.setOrientation(LinearLayout.HORIZONTAL);
        pills = new TextView[]{pill("state"), pill("node"), pill("agent"), pill("yadb")};
        for (TextView view : pills) {
            pillRow.addView(view);
        }
        statusBody.addView(pillRow);

        MaterialCardView promptCard = card(content, "INSTRUCTION");
        LinearLayout promptBody = cardBody(promptCard);
        promptInput = editor(3, false);
        promptInput.setHint("自然语言指令，例如：打开设置并搜索 Wi-Fi");
        promptBody.addView(promptInput);
        LinearLayout promptRow = buttonRow(promptBody);
        promptRow.addView(filledButton("Run instruction", view -> runInstruction()));
        promptRow.addView(primaryButton("Stop", view ->
                AgentService.start(this, AgentService.ACTION_STOP, null)));

        MaterialCardView logCard = card(content, "RUN LOG");
        LinearLayout logBody = cardBody(logCard);
        logView = new TextView(this);
        logView.setTypeface(Typeface.MONOSPACE);
        logView.setTextSize(11);
        logView.setTextColor(getColor(R.color.text_secondary));
        logView.setMovementMethod(new ScrollingMovementMethod());
        logView.setMinLines(12);
        logBody.addView(logView);
        LinearLayout logRow = buttonRow(logBody);
        logRow.addView(primaryButton("Clear log", view -> logView.setText("")));
        logRow.addView(primaryButton("History", view -> showPage(2, true)));

        return page;
    }

    private LinearLayout buildScriptsPage() {
        LinearLayout page = page();
        MaterialCardView card = card(page, "CONFIG.YAML");
        LinearLayout body = cardBody(card);
        configEditor = editor(14, true);
        configEditor.addTextChangedListener(new SimpleWatcher(() -> {
            if (!loadingText) {
                configDirty = true;
            }
        }));
        ScrollView scroll = new ScrollView(this);
        scroll.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        scroll.addView(configEditor);
        body.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout row = buttonRow(body);
        row.addView(filledButton("Run config", view -> runConfig()));
        row.addView(primaryButton("Save", view -> saveConfig(true)));
        row.addView(primaryButton("Reload", view -> loadConfigEditor()));
        return page;
    }

    private LinearLayout buildHistoryPage() {
        LinearLayout page = page();
        MaterialCardView card = card(page, "RUNS");
        LinearLayout body = cardBody(card);
        historyView = new TextView(this);
        historyView.setTypeface(Typeface.MONOSPACE);
        historyView.setTextSize(11);
        historyView.setTextColor(getColor(R.color.text_secondary));
        historyView.setPadding(0, getResources().getDimensionPixelSize(R.dimen.space_sm), 0,
                getResources().getDimensionPixelSize(R.dimen.space_sm));
        body.addView(historyView);
        LinearLayout row = buttonRow(body);
        row.addView(primaryButton("Refresh", view -> refreshHistory()));
        return page;
    }

    private LinearLayout buildSetupPage() {
        LinearLayout page = page();

        MaterialCardView runtime = card(page, "RUNTIME");
        LinearLayout runtimeBody = cardBody(runtime);
        LinearLayout runtimeRow = buttonRow(runtimeBody);
        runtimeRow.addView(filledButton("Provision", view ->
                AgentService.start(this, AgentService.ACTION_PROVISION, null)));
        runtimeRow.addView(primaryButton("Check state", view -> refreshStatus()));
        LinearLayout accessRow = buttonRow(runtimeBody);
        accessRow.addView(primaryButton("Battery exemption", view -> requestBatteryExemption()));
        accessRow.addView(primaryButton("Open Shizuku", view -> openShizuku()));

        MaterialCardView theme = card(page, "APPEARANCE");
        LinearLayout themeBody = cardBody(theme);
        LinearLayout themeRow = buttonRow(themeBody);
        themeRow.addView(primaryButton("Light", view -> setThemeMode("light")));
        themeRow.addView(primaryButton("Dark", view -> setThemeMode("dark")));
        themeRow.addView(primaryButton("System", view -> setThemeMode("system")));

        MaterialCardView model = card(page, "MODEL.ENV");
        LinearLayout modelBody = cardBody(model);
        modelEditor = editor(5, true);
        modelBody.addView(modelEditor);
        LinearLayout modelRow = buttonRow(modelBody);
        modelRow.addView(filledButton("Save", view -> saveModelEnv()));
        modelRow.addView(primaryButton("Run doctor", view -> runDoctor()));

        return page;
    }

    // ----------------------------------------------------------------- runs

    private void runInstruction() {
        String prompt = promptInput.getText().toString().trim();
        if (prompt.isEmpty()) {
            toast("Enter an instruction first");
            return;
        }
        AgentService.start(this, AgentService.ACTION_RUN_PROMPT,
                new Intent().putExtra(AgentService.EXTRA_PROMPT, prompt));
        showPage(0, true);
    }

    private void runConfig() {
        saveConfig(false);
        AgentService.start(this, AgentService.ACTION_RUN_CONFIG,
                new Intent().putExtra(AgentService.EXTRA_CONFIG_PATH,
                        new File(getFilesDir(), "config.yaml").getAbsolutePath()));
        showPage(0, true);
    }

    private void runDoctor() {
        saveModelEnv();
        String yaml = "name: doctor\n"
                + "device:\n  backend: rish\n  displayId: 0\n  rishPath: /data/local/tmp/rish\n"
                + "agent:\n  generateReport: false\n  resetToHome: true\n"
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
                + "  resetToHome: true\n"
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
            text.append(record.ok ? "● OK   " : "● ERR  ")
                    .append(format.format(new Date(record.startedAt)))
                    .append("   ").append(record.configName)
                    .append("   ").append(record.durationMs / 1000).append("s")
                    .append("   tasks ").append(record.taskCount - record.failedTasks)
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
            labels[index] = (record.ok ? "OK  " : "ERR ")
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

    // ---------------------------------------------------------------- theme

    private void applySavedTheme() {
        SharedPreferences prefs = getSharedPreferences(THEME_PREFS, MODE_PRIVATE);
        applyThemeMode(prefs.getString(THEME_KEY, "system"));
    }

    private void setThemeMode(String mode) {
        getSharedPreferences(THEME_PREFS, MODE_PRIVATE).edit().putString(THEME_KEY, mode).apply();
        applyThemeMode(mode);
    }

    private void applyThemeMode(String mode) {
        switch (mode) {
            case "light":
                AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
                break;
            case "dark":
                AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);
                break;
            default:
                AppCompatDelegate.setDefaultNightMode(
                        AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
                break;
        }
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
     * battery optimisation exemption, so ask through the system dialog instead of
     * relying on adb-only privileges.
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
        if (pills == null) {
            return;
        }
        boolean nodeReady = new File(Provisioner.nodePath(this)).exists();
        boolean agentReady = Provisioner.cliFile(this).exists();
        boolean yadbReady = new File(Provisioner.YADB_TARGET).exists();
        boolean busy = AgentService.isBusy();

        pills[0].setText("state " + AgentService.state);
        pills[0].setBackgroundColor(getColor(busy ? R.color.status_info_bg : R.color.surface_muted));
        pills[1].setText(nodeReady ? "node ready" : "node missing");
        pills[2].setText(agentReady ? "agent ready" : "agent missing");
        pills[3].setText(yadbReady ? "yadb ready" : "yadb missing");
        for (int index = 1; index < pills.length; index++) {
            boolean ready = index == 1 ? nodeReady : index == 2 ? agentReady : yadbReady;
            pills[index].setBackgroundColor(getColor(
                    ready ? R.color.status_success_bg : R.color.status_error_bg));
            pills[index].setTextColor(getColor(
                    ready ? R.color.status_success_fg : R.color.status_error));
        }
        pills[0].setTextColor(getColor(busy ? R.color.brand : R.color.text_secondary));

        if (toolbar != null) {
            toolbar.setSubtitle(busy
                    ? "running · started " + new SimpleDateFormat("HH:mm:ss", Locale.US)
                    .format(new Date(AgentService.runStartedAt))
                    : "idle · " + (nodeReady && agentReady ? "runtime ready" : "runtime not provisioned"));
        }
    }

    private void appendLog(String line) {
        ui.post(() -> {
            if (logView == null) {
                return;
            }
            logView.append(line + "\n");
            View parent = (View) logView.getParent();
            if (parent instanceof ScrollView) {
                ((ScrollView) parent).fullScroll(View.FOCUS_DOWN);
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
