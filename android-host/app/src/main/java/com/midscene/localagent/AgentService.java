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
        if (overlayContext != null) {
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
                + "  - name: " + safeName(prompt) + "\n"
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

    /** The CLI prints a JSON result on stdout; parse the last JSON object. */
    private JSONObject summarize(ShellRunner.Result result, String configPath) {
        String output = result.output;
        int start = output.indexOf('{');
        int end = output.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return new JSONObject(output.substring(start, end + 1));
            } catch (JSONException error) {
                Log.w(TAG, "result JSON not parseable: " + error.getMessage());
            }
        }

        JSONObject fallback = new JSONObject();
        try {
            fallback.put("name", new File(configPath).getName());
            fallback.put("ok", result.exitCode == 0);
        } catch (JSONException ignored) {
            // never happens for string/boolean values
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

    private void runAsync(String name, ThrowingRunnable task, String stateLabel) {
        if (isBusy()) {
            emit("[" + name + "] a run is already in progress (" + state + ")");
            return;
        }

        state = stateLabel;
        clearBuffer();
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
                OverlayView.post(OverlayView::hide);
            }
        }, "midscene-" + name);
        worker.start();
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

    private static String safeName(String prompt) {
        String name = prompt.trim().replaceAll("[^A-Za-z0-9]+", "-").toLowerCase(Locale.US);
        if (name.isEmpty()) {
            return "instruction";
        }
        return name.length() > 40 ? name.substring(0, 40) : name;
    }

    private static String quoteYaml(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
