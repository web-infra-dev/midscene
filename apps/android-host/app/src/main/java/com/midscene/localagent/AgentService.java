package com.midscene.localagent;

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

    public static final String ACTION_RUN_CONFIG = "com.midscene.localagent.RUN_CONFIG";
    public static final String ACTION_RUN_PROMPT = "com.midscene.localagent.RUN_PROMPT";
    public static final String ACTION_PROVISION = "com.midscene.localagent.PROVISION";
    public static final String ACTION_STOP = "com.midscene.localagent.STOP";
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
    private static volatile long runStartedAtMs = 0;
    private static volatile long stepStartedAtMs = 0;

    /** Set from onCreate so log lines can drive the floating progress pill. */
    private static Context overlayContext;
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
            OverlayView.post(() -> OverlayView.update(OverlayView.summarize(line)));
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
                    break;
                case "step.end":
                    phase = "ok".equals(event.optString("status")) ? "step done" : "step failed";
                    break;
                case "run.end":
                    phase = "ok".equals(event.optString("status")) ? "done" : "failed";
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
    }

    /**
     * Bar slots, left to right: phase, step counter, current step, timings.
     */
    private static String[] progressLines() {
        long now = System.currentTimeMillis();
        String chip = stepTotal > 0 ? Math.max(stepIndex, 1) + "/" + stepTotal : "";
        String detail = stepPrompt.isEmpty() ? lastMessage : stepPrompt;
        if (detail.contains(EVENT_MARKER.trim())) {
            detail = "";
        }
        String metrics = "";
        if (stepStartedAtMs > 0 && !"done".equals(phase) && !"failed".equals(phase)) {
            metrics = formatDuration(now - stepStartedAtMs);
            if (runStartedAtMs > 0) {
                metrics = metrics + " · " + formatDuration(now - runStartedAtMs);
            }
        }
        return new String[] { phase.isEmpty() ? "working" : phase, chip, detail, metrics };
    }

    private static String formatDuration(long millis) {
        long seconds = millis / 1000;
        return seconds < 60
                ? seconds + "s"
                : String.format(java.util.Locale.US, "%d:%02d", seconds / 60, seconds % 60);
    }

    /** Service-level log, kept next to the run logs for post-mortem reading. */
    private static void persistServiceLog(String line) {
        File dir = new File(SERVICE_LOG_DIR, "");
        if (!dir.exists() && !dir.mkdirs()) {
            return;
        }
        File file = new File(dir, "agent.log");
        try (FileOutputStream out = new FileOutputStream(file, true)) {
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
        runStore = new RunStore(getFilesDir());
        ShizukuExecBridge.ensureBound(this);
        ExecBridge.start(this);
        SERVICE_LOG_DIR = new File(getFilesDir(), "run").getAbsolutePath();
        overlayContext = this;
        createChannel();
        startForegroundCompat("Midscene agent", "idle");
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
                runAsync("provision", () -> {
                    Provisioner.extractAgent(this, AgentService::emit);
                    try {
                        Provisioner.installYadb(this, AgentService::emit);
                    } catch (IOException error) {
                        emit("yadb provisioning failed: " + error.getMessage());
                    }
                    ShellRunner.runCli(this, getFilesDir(), AgentService::emit, "--version");
                }, "provisioning");
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
        releaseWakeLock();
        super.onDestroy();
    }

    // --------------------------------------------------------------- runs

    /** Prepare a config with one natural-language task and run it. */
    private void runPrompt(String prompt) throws IOException {
        File config = new File(getFilesDir(), "prompt-run.yaml");
        String yaml = "name: prompt-run\n"
                + deviceYaml()
                + "agent:\n"
                + "  generateReport: true\n"
                + "  resetToHome: true\n"
                + "  controllerPackage: " + getPackageName() + "\n"
                + "  reportDir: ./midscene_run/results\n"
                + "tasks:\n"
                + "  - name: " + quoteYaml(safeName(prompt)) + "\n"
                + "    type: aiAct\n"
                + "    prompt: " + quoteYaml(prompt) + "\n";
        java.nio.file.Files.write(config.toPath(), yaml.getBytes(StandardCharsets.UTF_8));
        emit("prompt config written: " + config.getAbsolutePath());
        runConfig(config.getAbsolutePath());
    }

    /**
     * Device block shared by generated configs.
     *
     * No `displayId`: this build rejects `screencap -p -d 0`, so the transport has
     * to use its plain form. The channel directory is the app's external files
     * directory because it must be shell-writable (the shell writes payloads) and
     * app-readable (this process serves them over the bridge).
     */
    private String deviceYaml() {
        return "device:\n"
                + "  backend: rish\n"
                + "  rishPath: /data/local/tmp/rish\n"
                + "  yadbPath: /data/local/tmp/yadb\n"
                + "  fileChannelDir: " + channelDir().getAbsolutePath() + "\n";
    }

    private File channelDir() {
        File external = getExternalFilesDir(null);
        File base = external != null ? external : getFilesDir();
        File dir = new File(base, "channel");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return dir;
    }

    private void runConfig(String configPath) throws IOException {
        try {
            Provisioner.extractAgent(this, AgentService::emit);
            if (!new File(Provisioner.YADB_TARGET).exists()) {
                Provisioner.installYadb(this, AgentService::emit);
            }
        } catch (IOException error) {
            emit("provisioning before the run failed: " + error.getMessage());
        }

        String id = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date())
                + "-" + UUID.randomUUID().toString().substring(0, 6);
        File logFile = runStore.logFileFor(id);
        long startedAt = System.currentTimeMillis();
        runStartedAt = startedAt;
        acquireWakeLock();

        emit("=== run " + id + " ===");
        emit("config: " + configPath);

        ShellRunner.Result result;
        try (FileOutputStream logSink = new FileOutputStream(logFile, false)) {
            result = ShellRunner.runCli(this, getFilesDir(), line -> {
                emit(line);
                try {
                    logSink.write((line + "\n").getBytes(StandardCharsets.UTF_8));
                    logSink.flush();
                } catch (IOException ignored) {
                    // logging must never break a run
                }
            }, "run", configPath);
        }

        JSONObject summary = summarize(result, configPath);
        JSONObject record = new JSONObject();
        try {
            record.put("id", id);
            record.put("configName", summary.optString("name", "run"));
            record.put("startedAt", startedAt);
            record.put("durationMs", result.durationMs);
            record.put("ok", summary.optBoolean("ok", false));
            record.put("exitCode", result.exitCode);
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

        emit("exit=" + result.exitCode + " in " + result.durationMs + " ms");
        emit("history: " + id);
        releaseWakeLock();
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
                            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(open);
        } catch (Exception error) {
            Log.w(TAG, "could not bring the console forward: " + error);
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
        final String runKind = stateLabel;
        OverlayView.setOptions(
                prefs().getBoolean("showStatusBar", true),
                prefs().getBoolean("showEdgeGlow", true),
                prefs().getBoolean("showElementBox", true),
                prefs().getBoolean("showTapRipple", true),
                prefs().getBoolean("demoMode", false));
        phase = "";
        stepIndex = 0;
        stepTotal = 0;
        stepPrompt = "";
        runStartedAtMs = System.currentTimeMillis();
        stepStartedAtMs = 0;
        clearBuffer();
        startOverlayKeepAlive();
        OverlayView.post(() -> OverlayView.show(this, "Starting " + stateLabel + "…"));
        updateNotification("running " + stateLabel, "preparing");
        worker = new Thread(() -> {
            try {
                task.run();
            } catch (Exception error) {
                emit("[" + name + "] failed: " + error);
                Log.e(TAG, "run failed", error);
            } finally {
                state = "idle";
                currentTask = "";
                releaseWakeLock();
                updateNotification("Midscene agent", "idle");
                OverlayView.post(() -> {
                    OverlayView.clearTransient();
                    OverlayView.hide();
                });
                if (returnToAppAfterRun() && (runKind.equals("prompt") || runKind.equals("config"))) {
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
            worker.interrupt();
            emit("stop requested");
        }
        state = "idle";
        releaseWakeLock();
        updateNotification("Midscene agent", "stopped");
    }

    // -------------------------------------------------------- notification

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Agent runs", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shows the state of the on-device agent");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private void startForegroundCompat(String title, String text) {
        Notification notification = buildNotification(title, text);
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

    /**
     * Turn an instruction into a task name.
     *
     * Non-ASCII prompts sanitise to nothing but dashes (a Chinese instruction used
     * to yield "-", and `- name: -` is a YAML sequence marker, not a scalar), so
     * empty or dash-only results fall back to a fixed name.
     */
    private static String safeName(String prompt) {
        String name = prompt.trim()
                .replaceAll("[^A-Za-z0-9]+", "-")
                .replaceAll("^-+", "")
                .replaceAll("-+$", "")
                .toLowerCase(Locale.US);
        if (name.isEmpty()) {
            name = "task";
        }
        if (name.length() <= 40) {
            return name;
        }
        // Prefer a word boundary over a mid-word cut.
        int cut = name.lastIndexOf('-', 40);
        return cut > 12 ? name.substring(0, cut) : name.substring(0, 40);
    }

    private static String quoteYaml(String value) {
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", " ")
                .replace("\n", "\\n") + "\"";
    }

    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
