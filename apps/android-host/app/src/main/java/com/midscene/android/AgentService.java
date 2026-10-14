package com.midscene.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Foreground service that owns agent runs.
 *
 * Runs must not depend on the activity: Android reclaims backgrounded UI under
 * memory pressure (observed on a 2GB emulator, twice), which killed the child
 * process mid-run. A foreground service keeps the process alive, shows progress
 * in a notification, and holds a wake lock while a run is in flight.
 */
public class AgentService extends Service {

    public static final String TAG = "MidsceneAgentService";
    private static final String CHANNEL_ID = "midscene-agent";
    private static final String EVENT_MARKER = "[event] ";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_RUN_CONFIG = "com.midscene.android.RUN_CONFIG";
    public static final String ACTION_RUN_PROMPT = "com.midscene.android.RUN_PROMPT";
    public static final String ACTION_PROVISION = "com.midscene.android.PROVISION";
    /**
     * Hold the process up while a pairing is in flight, and nothing else.
     *
     * Pairing happens entirely while this app is in the background — the user is on
     * the wireless-debugging screen with the notification shade down — and an
     * aggressive ROM freezes a cached process, which suspends the main looper. That
     * kills the mDNS callbacks and their timeout alike, so the pairing sat at
     * "discovering" until the user gave up. A foreground service is what keeps the
     * process out of the freezer.
     */
    public static final String ACTION_PAIRING = "com.midscene.android.PAIRING";
    /**
     * Let the process go back to sleep once a pairing attempt is over.
     *
     * Without this the "Pairing" foreground service would outlive the attempt and
     * leave a notification the user cannot dismiss.
     */
    public static final String ACTION_PAIRING_DONE = "com.midscene.android.PAIRING_DONE";
    public static final String ACTION_STOP = "com.midscene.android.STOP";
    public static final String EXTRA_CONFIG_PATH = "configPath";
    public static final String EXTRA_PROMPT = "prompt";

    /** Current run state, readable without binding (single process by design). */
    public static volatile String state = "idle";
    public static volatile String currentTask = "";
    public static volatile long runStartedAt;
    public static volatile String lastMessage = "";
    // ---- live progress, fed by the runner's structured `[event] {json}` lines ----
    private static volatile String phase = "";
    private static volatile int stepIndex = 0;
    private static volatile int stepTotal = 0;
    private static volatile String stepPrompt = "";
    /** The device action the agent reported most recently ("Tap - Wi-Fi"). */
    private static volatile String actionTip = "";
    private static volatile long runStartedAtMs = 0;
    private static volatile long stepStartedAtMs = 0;

    /** Set from onCreate so log lines can drive the floating progress pill. */
    private static Context overlayContext;
    /** Set from onCreate so static event handlers can update the run notification. */
    private static AgentService instance;
    /** Overwritten from onCreate with the app's private run directory. */
    private static String SERVICE_LOG_DIR = "/data/local/tmp";

    private static final List<LogListener> LISTENERS = new ArrayList<>();
    private static final List<String> LOG_BUFFER = new ArrayList<>();
    private static final int LOG_BUFFER_LIMIT = 500;
    private static PowerManager.WakeLock wakeLock;

    public interface LogListener {
        void onLog(String line);
    }

    public class LocalBinder extends Binder {
        public AgentService service() {
            return AgentService.this;
        }
    }

    private final IBinder binder = new LocalBinder();
    private Thread worker;
    private volatile Process activeProcess;
    private volatile boolean stopRequested;
    private static Thread overlayTicker;
    private RunStore runStore;

    public static void addListener(LogListener listener) {
        synchronized (LISTENERS) {
            LISTENERS.add(listener);
        }
    }

    public static void removeListener(LogListener listener) {
        synchronized (LISTENERS) {
            LISTENERS.remove(listener);
        }
    }

    public static List<String> logBuffer() {
        synchronized (LOG_BUFFER) {
            return new ArrayList<>(LOG_BUFFER);
        }
    }

    private static void clearBuffer() {
        synchronized (LOG_BUFFER) {
            LOG_BUFFER.clear();
        }
    }

    private static void emit(String line) {
        // Captured before the assignment: a structured event line must fall back to the
        // text that was on screen, not to its own JSON.
        String previousMessage = lastMessage;
        lastMessage = line;
        persistServiceLog(line);

        int eventAt = line == null ? -1 : line.lastIndexOf(EVENT_MARKER);
        if (eventAt >= 0) {
            // The stream may carry the marker more than once (the CLI echoes onEvent
            // messages too), so parse from the last one.
            applyProgressEvent(line.substring(eventAt + EVENT_MARKER.length()));
            return;
        }

        if (overlayContext != null && phase.isEmpty()) {
            OverlayView.post(() ->
                    OverlayView.update(ProgressText.summarize(line, previousMessage)));
            // Same terse line in the shade: provisioning emits no step events, so this is
            // the only thing that moves while it runs.
            updateRunNotification();
        }
        synchronized (LOG_BUFFER) {
            LOG_BUFFER.add(line);
            if (LOG_BUFFER.size() > LOG_BUFFER_LIMIT) {
                LOG_BUFFER.remove(0);
            }
        }
        synchronized (LISTENERS) {
            for (LogListener listener : new ArrayList<>(LISTENERS)) {
                listener.onLog(line);
            }
        }
    }

    /**
     * Turn one structured event into the pill's three lines: what the agent is
     * doing, which step, and how long it has been at it.
     */
    private static void applyProgressEvent(String json) {
        try {
            JSONObject event = new JSONObject(json);
            String name = event.optString("event", "");
            switch (name) {
                case "run.start":
                    runStartedAtMs = event.optLong("startedAt", System.currentTimeMillis());
                    stepTotal = event.optInt("total", 0);
                    stepIndex = 0;
                    phase = "starting";
                    break;
                case "step.start":
                    phase = event.optString("phase", "acting");
                    stepIndex = event.optInt("index", 0);
                    stepTotal = event.optInt("total", stepTotal);
                    stepPrompt = event.optString("prompt", event.optString("name", ""));
                    stepStartedAtMs = event.optLong("startedAt", System.currentTimeMillis());
                    actionTip = "";
                    break;
                case "action":
                    // The finest progress signal there is: a yaml script reports one step
                    // for its whole flow, so without this the bar sits on 1/1 while five
                    // actions run underneath it.
                    actionTip = event.optString("tip", "");
                    break;
                case "step.end":
                    phase = "ok".equals(event.optString("status")) ? "step done" : "step failed";
                    actionTip = "";
                    break;
                case "run.end":
                    phase = "ok".equals(event.optString("status")) ? "done" : "failed";
                    actionTip = "";
                    break;
                case "locate": {
                    // Screen-space rect of the element the agent located.
                    JSONObject rect = event.optJSONObject("rect");
                    if (rect != null) {
                        OverlayView.post(() -> OverlayView.showBox(
                                (float) rect.optDouble("x"),
                                (float) rect.optDouble("y"),
                                (float) rect.optDouble("w"),
                                (float) rect.optDouble("h")));
                    }
                    return;
                }
                case "tap": {
                    double x = event.optDouble("x", -1);
                    double y = event.optDouble("y", -1);
                    if (x >= 0 && y >= 0) {
                        OverlayView.post(() -> OverlayView.showRipple((float) x, (float) y));
                    }
                    return;
                }
                default:
                    return;
            }
        } catch (JSONException error) {
            return;
        }

        if (overlayContext == null) {
            return;
        }
        OverlayView.post(() -> OverlayView.updateProgress(progressLines()));
        updateRunNotification();
    }

    /**
     * Keep the foreground notification in step with the run.
     *
     * It used to be written once ("running config / preparing") and never again, so the
     * only thing a user could see from the shade was the start of the run.
     */
    private static void updateRunNotification() {
        AgentService service = instance;
        if (service == null) {
            return;
        }
        String[] lines = progressLines();
        long stepMs = stepStartedAtMs > 0 && !"done".equals(phase) && !"failed".equals(phase)
                ? System.currentTimeMillis() - stepStartedAtMs
                : 0;
        service.updateNotification(
                ProgressText.notificationTitle(lines[0], ProgressText.stepProgress(stepIndex, stepTotal)),
                ProgressText.notificationText(lines[2], stepMs));
    }

    /**
     * Bar slots, left to right: what the agent is doing, which step, the step itself (in
     * words), and the run's clock. The humanising lives in {@link ProgressText}: this
     * method only knows the state machine.
     *
     * The first row stays terse on purpose — a counter, one duration — because it shares
     * its line with the stop control and is read at a glance: `1/1` rather than "Step
     * 1/1", and the run's elapsed time rather than both clocks. The step's own duration
     * is the one that had to go: it changes every second and says nothing the elapsed
     * time does not.
     */
    private static String[] progressLines() {
        long now = System.currentTimeMillis();
        String chip = ProgressText.stepProgress(stepIndex, stepTotal);
        // A step's own prompt when there is one, otherwise the tail of the last log line;
        // structured events fall through to the previous text rather than raw JSON.
        String detail = stepPrompt.isEmpty()
                ? ProgressText.describeStep(lastMessage, actionTip)
                : ProgressText.describeStep(stepPrompt, actionTip);
        if (detail.contains(EVENT_MARKER.trim())) {
            detail = "";
        }
        String metrics = "";
        boolean timing = stepStartedAtMs > 0 && !"done".equals(phase) && !"failed".equals(phase);
        if (timing && runStartedAtMs > 0) {
            metrics = ProgressText.duration(now - runStartedAtMs);
        }
        // The last two slots are the start timestamps, so the bar can tick the clock
        // itself: events only arrive per step, and a step can run for half a minute.
        return new String[] {
                ProgressText.phaseLabel(phase),
                chip,
                detail,
                metrics,
                phase,
                timing ? String.valueOf(stepStartedAtMs) : "0",
                timing && runStartedAtMs > 0 ? String.valueOf(runStartedAtMs) : "0",
        };
    }

    /** Service-level log, kept next to the run logs for post-mortem reading. */
    private static synchronized void persistServiceLog(String line) {
        File dir = new File(SERVICE_LOG_DIR, "");
        if (!dir.exists() && !dir.mkdirs()) {
            return;
        }
        File file = new File(dir, "agent.log");
        try (FileOutputStream out = new FileOutputStream(file, file.length() < 4L * 1024 * 1024)) {
            out.write(("[" + new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date())
                    + "] " + line + "\n").getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) {
            // logging must never break a run
        }
    }

    public static boolean isBusy() {
        return !"idle".equals(state);
    }

    public static void start(Context context, String action, Intent extras) {
        Intent intent = new Intent(context, AgentService.class).setAction(action);
        if (extras != null) {
            intent.putExtras(extras);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        runStore = new RunStore(getFilesDir());
        ActiveExec.install(this);
        ShizukuExecBridge.ensureBound(this);
        ExecBridge.start(this);
        SERVICE_LOG_DIR = new File(getFilesDir(), "run").getAbsolutePath();
        overlayContext = this;
        // The pill and the notification are the app's own copy: follow its language.
        AndroidWords.install(this);
        createChannel();
        startForegroundCompat(getString(R.string.notify_agent_title),
                getString(R.string.notify_state_idle));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) {
            return START_STICKY;
        }

        switch (action) {
            case ACTION_STOP:
                stopCurrentRun();
                break;
            case ACTION_PROVISION:
                runAsync("provision", () -> Provisioner.installRuntime(this, AgentService::emit),
                        "provisioning");
                break;
            case ACTION_RUN_PROMPT: {
                String prompt = intent.getStringExtra(EXTRA_PROMPT);
                runAsync("prompt", () -> runPrompt(prompt), "prompt");
                break;
            }
            case ACTION_RUN_CONFIG: {
                String configPath = intent.getStringExtra(EXTRA_CONFIG_PATH);
                runAsync("config", () -> runConfig(configPath), "config");
                break;
            }
            case ACTION_PAIRING:
                // The pairing notification *is* the foreground notification: two
                // notifications from one app group together, and a grouped one is
                // rendered collapsed with its input action unreachable.
                startForegroundCompat(AdbPairing.buildCodeRequest(this));
                break;
            case ACTION_PAIRING_DONE:
                // A provisioning started in the meantime owns the service now.
                if (!isBusy()) {
                    // Detach, not remove: the pairing notification is the only place the
                    // outcome is reported, and a failure leaves its input field live so
                    // the next try is one tap instead of a trip back through 开始配对.
                    stopForeground(Service.STOP_FOREGROUND_DETACH);
                    stopSelf();
                }
                break;
            default:
                break;
        }

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        instance = null;
        Process process = activeProcess;
        if (process != null) {
            process.destroyForcibly();
        }
        if (worker != null) {
            worker.interrupt();
        }
        releaseWakeLock();
        super.onDestroy();
    }

    // --------------------------------------------------------------- runs

    /** Prepare a config with one natural-language task and run it. */
    private void runPrompt(String prompt) throws IOException {
        if (prompt == null || prompt.trim().isEmpty()) {
            throw new IOException("prompt is empty");
        }
        File config = new File(getFilesDir(), "prompt-run.yaml");
        // The report switch is read per run, like every other preference here: a head
        // unit keeps this service alive across a settings change, so a value cached at
        // startup would be wrong for the rest of the session.
        String yaml = PromptConfig.yaml(
                prompt,
                deviceYaml(),
                getPackageName(),
                "./midscene_run/results",
                prefs().getBoolean("generateReport", true));
        java.nio.file.Files.write(config.toPath(), yaml.getBytes(StandardCharsets.UTF_8));
        emit("prompt config written: " + config.getAbsolutePath());
        runConfig(config.getAbsolutePath());
    }

    /**
     * Device block shared by generated configs.
     *
     * No `displayId`: this build rejects `screencap -p -d 0`, so the transport has
     * to use its plain form. The shell owns the channel directory. Payloads return
     * to the app through a Binder descriptor pipe, not a shared storage mount.
     */
    private String deviceYaml() {
        return "device:\n"
                + "  backend: device-bridge\n"
                + "  yadbPath: /data/local/tmp/yadb\n"
                + "  fileChannelDir: " + Provisioner.channelDir(this).getAbsolutePath() + "\n";
    }

    private void runConfig(String configPath) throws IOException {
        File configFile = requirePrivateConfig(configPath);
        Provisioner.extractAgent(this, AgentService::emit);
        if (!new File(Provisioner.YADB_TARGET).exists()) {
            Provisioner.installYadb(this, AgentService::emit);
        }

        String id = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date())
                + "-" + UUID.randomUUID().toString().substring(0, 6);
        File logFile = runStore.logFileFor(id);
        long startedAt = System.currentTimeMillis();
        runStartedAt = startedAt;
        acquireWakeLock();

        emit("=== run " + id + " ===");
        emit("config: " + configFile.getAbsolutePath());

        ShellRunner.Result result;
        try (FileOutputStream logSink = new FileOutputStream(logFile, false)) {
            result = ShellRunner.runCliControlled(this, getFilesDir(), line -> {
                emit(line);
                try {
                    logSink.write((line + "\n").getBytes(StandardCharsets.UTF_8));
                    logSink.flush();
                } catch (IOException ignored) {
                    // logging must never break a run
                }
            }, process -> {
                activeProcess = process;
                if (process != null && stopRequested) {
                    process.destroyForcibly();
                }
            }, "run", configFile.getAbsolutePath());
        }

        JSONObject summary = summarize(result, configFile.getAbsolutePath());
        JSONObject record = new JSONObject();
        try {
            record.put("id", id);
            record.put("configName", summary.optString("name", "run"));
            record.put("startedAt", startedAt);
            record.put("durationMs", result.durationMs);
            record.put("ok", !stopRequested && summary.optBoolean("ok", false));
            record.put("exitCode", stopRequested ? -1 : result.exitCode);
            JSONArray tasks = summary.optJSONArray("tasks");
            record.put("taskCount", tasks == null ? 0 : tasks.length());
            record.put("failedTasks", countFailed(tasks));
            record.put("resultFile", summary.optString("resultFile", ""));
            record.put("reportFile", summary.optString("reportFile", ""));
            record.put("logFile", logFile.getAbsolutePath());
        } catch (JSONException error) {
            emit("could not build history record: " + error.getMessage());
        }
        runStore.append(record);

        emit((stopRequested ? "stopped" : "exit=" + result.exitCode)
                + " in " + result.durationMs + " ms");
        emit("history: " + id);
        releaseWakeLock();
    }

    private File requirePrivateConfig(String configPath) throws IOException {
        if (configPath == null || configPath.trim().isEmpty()) {
            throw new IOException("config path is empty");
        }
        File root = getFilesDir().getCanonicalFile();
        File file = new File(configPath).getCanonicalFile();
        if (!file.getPath().startsWith(root.getPath() + File.separator) || !file.isFile()) {
            throw new IOException("config must be an existing file in app-private storage");
        }
        return file;
    }

    /**
     * Pull the run result out of the CLI's output.
     *
     * The result is pretty-printed, so its root brace sits alone on a line and the
     * nested objects also start with "{": searching for the last brace (or the last
     * "{\n") finds a nested object, which is why successful runs were recorded as
     * failures without a report. Candidate roots are tried from the top instead, and
     * only an object carrying a "tasks" array is accepted.
     */
    private JSONObject summarize(ShellRunner.Result result, String configPath) {
        String[] lines = result.output.split("\r?\n");

        // Single-line result (compact JSON somewhere in the output).
        for (int index = lines.length - 1; index >= 0; index--) {
            String line = lines[index].trim();
            if (!line.startsWith("{") || !line.contains("\"tasks\"")) {
                continue;
            }
            try {
                return new JSONObject(line);
            } catch (JSONException ignored) {
                // keep looking
            }
        }

        // Pretty-printed result: try every line that opens a root-level object.
        StringBuilder candidate = new StringBuilder();
        for (int index = 0; index < lines.length; index++) {
            String trimmed = lines[index].trim();
            if (!"{".equals(trimmed)) {
                continue;
            }
            candidate.setLength(0);
            for (int rest = index; rest < lines.length; rest++) {
                candidate.append(lines[rest]).append('\n');
            }
            String text = candidate.toString();
            if (!text.contains("\"tasks\"")) {
                continue;
            }
            try {
                return new JSONObject(text);
            } catch (JSONException ignored) {
                // a nested object: try the next candidate
            }
        }

        JSONObject fallback = new JSONObject();
        try {
            fallback.put("name", new File(configPath).getName());
            fallback.put("ok", result.exitCode == 0);
        } catch (JSONException ignored) {
            // never happens for string and boolean values
        }
        return fallback;
    }

    private int countFailed(JSONArray tasks) {
        int failed = 0;
        if (tasks == null) {
            return 0;
        }
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task != null && !"ok".equals(task.optString("status"))) {
                failed++;
            }
        }
        return failed;
    }

    /**
     * Reopen the console after a run so the result is one glance away.
     *
     * Starting an activity from the background is restricted on modern Android,
     * but this app holds the overlay permission (needed for the progress pill) and
     * runs a foreground service, which is exactly the documented exemption. The
     * notification also opens the console, so a refusal is harmless.
     */
    private void bringConsoleToFront() {
        try {
            Intent open = new Intent(this, ConsoleActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                    // Returning is about the result, so land on the run list.
                    .putExtra("openHistory", true);
            startActivity(open);
        } catch (Exception error) {
            Log.w(TAG, "could not bring the console forward: " + error);
        }
    }

    /**
     * The state label as a person reads it ("prompt" → instruction). The raw value stays
     * the internal key: it is what {@link #state} holds and what the run log prints.
     */
    private String stateLabelText(String stateLabel) {
        switch (stateLabel) {
            case "prompt":
                return getString(R.string.notify_state_prompt);
            case "config":
                return getString(R.string.notify_state_config);
            case "provisioning":
                return getString(R.string.notify_state_provisioning);
            default:
                return stateLabel;
        }
    }

    private android.content.SharedPreferences prefs() {
        return getSharedPreferences("midscene-ui", MODE_PRIVATE);
    }

    /** User preference: return to the app when a run completes (default on). */
    private boolean returnToAppAfterRun() {
        return getSharedPreferences("midscene-ui", MODE_PRIVATE)
                .getBoolean("returnAfterRun", true);
    }

    private void runAsync(String name, ThrowingRunnable task, String stateLabel) {
        if (isBusy()) {
            emit("[" + name + "] a run is already in progress (" + state + ")");
            return;
        }

        state = stateLabel;
        stopRequested = false;
        final String runKind = stateLabel;
        OverlayView.setOptions(
                prefs().getBoolean("showStatusBar", true),
                prefs().getBoolean("showEdgeGlow", true),
                prefs().getBoolean("showElementBox", true),
                prefs().getBoolean("showTapRipple", true),
                prefs().getBoolean("demoMode", false));
        // Read the switch on every run: a head unit can keep this service alive
        // across a settings change, so the value cannot be cached at startup.
        OverlayView.setShowEnabled(prefs().getBoolean("overlayEnabled", true), this);
        // Only a task run can be interrupted from the panel: provisioning's worker is what
        // unpacks Node and the agent, and stopping it half way leaves a broken runtime.
        OverlayView.setStoppable("prompt".equals(runKind) || "config".equals(runKind));
        phase = "";
        stepIndex = 0;
        stepTotal = 0;
        stepPrompt = "";
        actionTip = "";
        runStartedAtMs = System.currentTimeMillis();
        stepStartedAtMs = 0;
        clearBuffer();
        startOverlayKeepAlive();
        if (prefs().getBoolean("overlayEnabled", true)) {
            OverlayView.post(() -> OverlayView.show(this,
                    getString(R.string.notify_run_starting, stateLabelText(stateLabel))));
        }
        updateNotification(getString(R.string.notify_state_starting), stateLabelText(stateLabel));
        worker = new Thread(() -> {
            try {
                task.run();
            } catch (Exception error) {
                if (stopRequested) {
                    emit("[" + name + "] stopped by user");
                } else {
                    emit("[" + name + "] failed: " + error);
                    Log.e(TAG, "run failed", error);
                }
            } finally {
                activeProcess = null;
                state = "idle";
                currentTask = "";
                releaseWakeLock();
                updateNotification(getString(R.string.notify_agent_title),
                        getString(R.string.notify_state_idle));
                OverlayView.post(() -> {
                    OverlayView.clearTransient();
                    OverlayView.hide();
                });
                if (returnToAppAfterRun()
                        && (runKind.equals("prompt") || runKind.equals("config"))) {
                    bringConsoleToFront();
                }
            }
        }, "midscene-" + name);
        worker.start();
    }

    /**
     * Slow tick that keeps the progress pill rendered while a run is in flight.
     * System screens can destroy the overlay surface, which used to make the pill
     * look like it had been switched off.
     */
    /**
     * Re-post the pairing notification with the last failure in it.
     *
     * @return whether the notification was actually updated: without the foreground
     *         service there is nothing to update, and the caller reports the ordinary
     *         way instead.
     */
    static boolean showPairingError(Context context, String error) {
        AgentService service = instance;
        NotificationManager manager = service == null ? null
                : service.getSystemService(NotificationManager.class);
        if (manager == null) {
            return false;
        }
        manager.notify(NOTIFICATION_ID, AdbPairing.buildCodeRequest(context, error));
        return true;
    }

    private void startOverlayKeepAlive() {
        if (overlayTicker != null) {
            return;
        }
        overlayTicker = new Thread(() -> {
            while (!"idle".equals(state)) {
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
                final String text = lastMessage;
                OverlayView.post(() -> OverlayView.refresh(text));
            }
            overlayTicker = null;
        }, "midscene-overlay-tick");
        overlayTicker.setDaemon(true);
        overlayTicker.start();
    }

    private void stopCurrentRun() {
        if (worker != null && worker.isAlive()) {
            stopRequested = true;
            state = "stopping";
            Process process = activeProcess;
            if (process != null) {
                process.destroyForcibly();
            }
            worker.interrupt();
            emit("stop requested");
            updateNotification(getString(R.string.notify_state_stopping), "");
        }
    }

    // -------------------------------------------------------- notification

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, getString(R.string.notify_channel_agent),
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.notify_channel_agent_desc));
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private void startForegroundCompat(String title, String text) {
        startForegroundCompat(buildNotification(title, text));
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Target 34 requires an explicit foreground service type.
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification(String title, String text) {
        Intent open = new Intent(this, ConsoleActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setOngoing(isBusy())
                .setContentIntent(contentIntent)
                .build();
    }

    private void updateNotification(String title, String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(title, text));
        }
    }

    // ------------------------------------------------------------ wakelock

    private void acquireWakeLock() {
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        if (power == null) {
            return;
        }
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "midscene:agent-run");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(60 * 60 * 1000L);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
