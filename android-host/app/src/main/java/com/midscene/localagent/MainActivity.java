package com.midscene.localagent;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Minimal on-device agent console.
 *
 * Responsibilities: prepare the runtime (Node + agent bundle), keep a config
 * file on disk, start the CLI and stream its output. Everything the agent needs
 * is already inside the APK, so the app works without Termux or a PC.
 */
public class MainActivity extends Activity {

    private static final String AGENT_ASSET = "agent-bundle.zip";
    private static final String CONFIG_FILE = "config.yaml";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView statusView;
    private TextView logView;
    private EditText configView;
    private Button prepareButton;
    private Button doctorButton;
    private Button runButton;
    private Thread worker;
    /** True once the user edited the config, so an externally pushed file wins otherwise. */
    private boolean configDirty;
    /** Guards against setText() being mistaken for a user edit. */
    private boolean loadingConfig;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildLayout());
        writeDefaultConfigIfMissing();
        statusView.setText(runtimeSummary());
        appendLog("Ready. App dir: " + getFilesDir().getAbsolutePath());
        appendLog("Native lib dir: " + getApplicationInfo().nativeLibraryDir);
    }

    // ---------------------------------------------------------------- layout

    private View buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(12);
        root.setPadding(pad, pad, pad, pad);

        statusView = new TextView(this);
        statusView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        statusView.setTypeface(Typeface.MONOSPACE);
        statusView.setTextColor(Color.DKGRAY);
        root.addView(statusView);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        prepareButton = addButton(buttons, "Prepare runtime", v -> runOnWorker("prepare", this::prepareRuntime));
        doctorButton = addButton(buttons, "doctor", v -> runOnWorker("doctor", () -> runCli("doctor", "--backend", "rish")));
        runButton = addButton(buttons, "run config", v -> runOnWorker("run", this::runConfig));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        for (int i = 0; i < buttons.getChildCount(); i++) {
            buttons.getChildAt(i).setLayoutParams(buttonParams);
        }
        root.addView(buttons);

        TextView configLabel = new TextView(this);
        configLabel.setText("Config (saved to " + CONFIG_FILE + ")");
        configLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        root.addView(configLabel);

        configView = new EditText(this);
        configView.setTypeface(Typeface.MONOSPACE);
        configView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        configView.setGravity(Gravity.TOP | Gravity.START);
        configView.setMinLines(6);
        configView.setMaxLines(12);
        configView.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(Editable s) {
                if (!loadingConfig) {
                    configDirty = true;
                }
            }
        });
        root.addView(configView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView logLabel = new TextView(this);
        logLabel.setText("Run log");
        logLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        root.addView(logLabel);

        ScrollView scroll = new ScrollView(this);
        logView = new TextView(this);
        logView.setTypeface(Typeface.MONOSPACE);
        logView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        logView.setMovementMethod(new ScrollingMovementMethod());
        scroll.addView(logView);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        return root;
    }

    private Button addButton(LinearLayout parent, String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        button.setAllCaps(false);
        button.setOnClickListener(listener);
        parent.addView(button);
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    // ------------------------------------------------------------- runtime

    private File agentDir() {
        return new File(getFilesDir(), "agent");
    }

    private File cliFile() {
        return new File(agentDir(), "node_modules/@midscene/android-local/dist/lib/cli.js");
    }

    private File configFile() {
        return new File(getFilesDir(), CONFIG_FILE);
    }

    private String nodePath() {
        return getApplicationInfo().nativeLibraryDir + "/libnodebin.so";
    }

    private String runtimeSummary() {
        return "node: " + (new File(nodePath()).exists() ? nodePath() : "MISSING")
                + "\nagent: " + (cliFile().exists() ? "extracted" : "not extracted yet");
    }

    private void setButtonsEnabled(boolean enabled) {
        prepareButton.setEnabled(enabled);
        doctorButton.setEnabled(enabled);
        runButton.setEnabled(enabled);
    }

    private void runOnWorker(String name, ThrowingRunnable task) {
        if (worker != null && worker.isAlive()) {
            appendLog("[" + name + "] a run is already in progress");
            return;
        }
        setButtonsEnabled(false);
        appendLog("=== " + name + " ===");
        worker = new Thread(() -> {
            try {
                task.run();
            } catch (Exception error) {
                appendLog("[" + name + "] failed: " + error);
            } finally {
                ui.post(() -> {
                    setButtonsEnabled(true);
                    statusView.setText(runtimeSummary());
                });
            }
        });
        worker.start();
    }

    /** Unpack the agent bundle from assets so Node can run it from disk. */
    private void prepareRuntime() throws IOException {
        if (!cliFile().exists()) {
            File target = agentDir();
            appendLog("extracting " + AGENT_ASSET + " -> " + target.getAbsolutePath());
            long startedAt = System.currentTimeMillis();
            try (InputStream raw = getAssets().open(AGENT_ASSET);
                 ZipInputStream zip = new ZipInputStream(raw)) {
                ZipEntry entry;
                byte[] buffer = new byte[64 * 1024];
                while ((entry = zip.getNextEntry()) != null) {
                    File out = new File(target, entry.getName());
                    if (entry.isDirectory()) {
                        out.mkdirs();
                        continue;
                    }
                    File parent = out.getParentFile();
                    if (parent != null) {
                        parent.mkdirs();
                    }
                    try (FileOutputStream sink = new FileOutputStream(out)) {
                        int read;
                        while ((read = zip.read(buffer)) > 0) {
                            sink.write(buffer, 0, read);
                        }
                    }
                }
            }
            appendLog("extracted in " + (System.currentTimeMillis() - startedAt) + " ms");
        } else {
            appendLog("agent bundle already extracted");
        }

        writeDefaultConfigIfMissing();
        runCli("--version");
    }

    private void runConfig() throws IOException {
        // Only persist the editor when the user actually changed it; a config
        // pushed in over adb (or by a future config manager) must not be lost.
        if (configDirty || !configFile().exists()) {
            String config = configView.getText().toString();
            if (config.trim().isEmpty()) {
                appendLog("config is empty; nothing to run");
                return;
            }
            try (FileOutputStream out = new FileOutputStream(configFile())) {
                out.write(config.getBytes(StandardCharsets.UTF_8));
            }
            configDirty = false;
        } else {
            appendLog("using config from disk: " + configFile().getAbsolutePath());
        }

        runCli("run", configFile().getAbsolutePath());
    }

    /** Start the bundled Node CLI and stream its output into the log view. */
    private void runCli(String... args) throws IOException {
        if (!new File(nodePath()).exists()) {
            appendLog("node runtime missing at " + nodePath());
            return;
        }
        if (!cliFile().exists()) {
            appendLog("agent bundle not extracted yet; press \"Prepare runtime\"");
            return;
        }

        List<String> command = new ArrayList<>();
        command.add(nodePath());
        command.add(cliFile().getAbsolutePath());
        for (String arg : args) {
            command.add(arg);
        }

        ProcessBuilder builder = new ProcessBuilder(command);
        File runDir = new File(getFilesDir(), "run");
        runDir.mkdirs();
        Map<String, String> env = builder.environment();
        env.put("LD_LIBRARY_PATH", getApplicationInfo().nativeLibraryDir);
        env.put("HOME", getFilesDir().getAbsolutePath());
        env.put("TMPDIR", getCacheDir().getAbsolutePath());
        env.put("PATH", getApplicationInfo().nativeLibraryDir + ":/system/bin:/system/xbin");
        env.put("MIDSCENE_RUN_DIR", runDir.getAbsolutePath());
        // rish asks Shizuku for the shell channel on behalf of this package, so the
        // user gets the permission prompt for the app rather than for a terminal.
        env.put("RISH_APPLICATION_ID", getPackageName());
        // Model credentials live outside the visible config: a `model.env` file
        // with KEY=VALUE lines is injected into the child environment. Production
        // builds should read these from the Android Keystore instead.
        env.putAll(readEnvFile(new File(getFilesDir(), "model.env")));
        builder.directory(agentDir());
        builder.redirectErrorStream(true);

        // Persist the output as well: a long run may outlive the visible screen,
        // and the file is what a support workflow (or the future UI) reads back.
        File runLog = new File(runDir, "last-run.log");
        long startedAt = System.currentTimeMillis();
        Process process = builder.start();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
             FileOutputStream logSink = new FileOutputStream(runLog, false)) {
            String line;
            while ((line = reader.readLine()) != null) {
                appendLog(line);
                logSink.write((line + "\n").getBytes(StandardCharsets.UTF_8));
                logSink.flush();
            }
        }
        int exitCode;
        try {
            exitCode = process.waitFor();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            process.destroy();
            appendLog("interrupted while waiting for the CLI");
            return;
        }
        appendLog("exit=" + exitCode + " in " + (System.currentTimeMillis() - startedAt) + " ms");
        appendLog("log: " + runLog.getAbsolutePath());
    }

    private void writeDefaultConfigIfMissing() {
        if (configFile().exists()) {
            loadConfigIntoEditor(readFile(configFile()));
            return;
        }

        String defaultConfig = String.join("\n", new String[]{
                "name: phone-smoke",
                "device:",
                "  backend: rish",
                "  displayId: 0",
                "  rishPath: /data/local/tmp/rish",
                "  yadbPath: /data/local/tmp/yadb",
                "model:",
                "  # Prefer the environment; the app stores this file in private storage.",
                "  apiKey: \"\"",
                "  baseUrl: \"\"",
                "  name: \"\"",
                "  family: \"\"",
                "agent:",
                "  generateReport: false",
                "  reportDir: ./midscene_run/results",
                "tasks:",
                "  - name: open-settings",
                "    type: aiAct",
                "    prompt: open the settings app",
                "  - name: settings-visible",
                "    type: aiAssert",
                "    prompt: the settings screen is visible",
                "",
        });

        try (FileOutputStream out = new FileOutputStream(configFile())) {
            out.write(defaultConfig.getBytes(StandardCharsets.UTF_8));
        } catch (IOException error) {
            appendLog("failed to write default config: " + error);
        }
        loadConfigIntoEditor(defaultConfig);
    }

    /** Load config text without marking it as a user edit. */
    private void loadConfigIntoEditor(String text) {
        loadingConfig = true;
        try {
            configView.setText(text);
            configDirty = false;
        } finally {
            loadingConfig = false;
        }
    }

    private Map<String, String> readEnvFile(File file) {
        Map<String, String> values = new java.util.HashMap<>();
        if (!file.exists()) {
            return values;
        }
        for (String line : readFile(file).split("\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#") || !trimmed.contains("=")) {
                continue;
            }
            int index = trimmed.indexOf('=');
            String key = trimmed.substring(0, index).trim();
            String value = trimmed.substring(index + 1).trim();
            if (!key.isEmpty()) {
                values.put(key, value);
            }
        }
        appendLog("model.env: injecting " + values.size() + " variables");
        return values;
    }

    private String readFile(File file) {
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new java.io.FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                text.append(line).append('\n');
            }
        } catch (IOException error) {
            return "";
        }
        return text.toString();
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

    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
