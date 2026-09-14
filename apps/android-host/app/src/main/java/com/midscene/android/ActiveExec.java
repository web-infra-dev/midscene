package com.midscene.android;

import android.content.Context;

import java.io.IOException;

/**
 * Which channel the shell commands actually travel on.
 *
 * The agent's Node process never learns the difference: it posts to
 * {@link ExecBridge} either way. Everything below that line is one of two
 * implementations — the Shizuku user service, or the app's own adb client
 * talking to the local adbd ({@link LocalAdbBackend}).
 *
 * The choice is a preference, not a fallback chain: silently switching channels
 * mid-run would leave a run's screenshots and its input events on two different
 * privilege paths, and a failure on one channel is diagnosed by knowing which
 * one was in use.
 */
public final class ActiveExec {

    public static final String CHANNEL_SHIZUKU = "shizuku";
    public static final String CHANNEL_ADB = "adb";

    private static final String PREF_FILE = "midscene-ui";
    private static final String KEY_CHANNEL = "execChannel";

    private static Context appContext;

    private ActiveExec() {
    }

    /** Same envelope the Shizuku bridge returns, so callers do not branch. */
    public static final class Result {
        public final int exitCode;
        public final String stdout;
        public final String stderr;

        Result(int exitCode, String stdout, String stderr) {
            this.exitCode = exitCode;
            this.stdout = stdout;
            this.stderr = stderr;
        }

        public boolean ok() {
            return exitCode == 0;
        }

        static Result from(ShizukuExecBridge.Result result) {
            return new Result(result.exitCode, result.stdout, result.stderr);
        }
    }

    public static void install(Context context) {
        if (context != null) {
            appContext = context.getApplicationContext();
        }
    }

    private static Context context(Context fallback) {
        if (fallback != null) {
            return fallback.getApplicationContext();
        }
        if (appContext == null) {
            throw new IllegalStateException("ActiveExec.install() has not run yet");
        }
        return appContext;
    }

    public static String channel(Context context) {
        String stored = context(context).getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
                // adb by default: it needs no second app and no permission the ROM can
                // withhold, which is the difference between working and not working on
                // a phone whose vendor restricted adb. Shizuku stays available for
                // devices where adb is the awkward one.
                .getString(KEY_CHANNEL, CHANNEL_ADB);
        return CHANNEL_SHIZUKU.equals(stored) ? CHANNEL_SHIZUKU : CHANNEL_ADB;
    }

    public static void setChannel(Context context, String channel) {
        Context app = context(context);
        app.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
                .edit().putString(KEY_CHANNEL, channel).apply();
        if (CHANNEL_SHIZUKU.equals(channel)) {
            // The adb server is a separate process that outlives this app and holds
            // a connection to adbd. Leaving it behind after switching channels
            // means a stray root-of-trust listening on 5037.
            new Thread(() -> {
                try {
                    LocalAdbBackend.killServer(app);
                } catch (IOException error) {
                    android.util.Log.w("MidsceneActiveExec", "kill-server failed: " + error);
                }
            }, "adb-kill-server").start();
        }
    }

    /**
     * A snapshot of the selected channel for the console to render.
     *
     * [ready] is what gates the Run button, so it has to mean "a command would
     * work right now" on the channel that is actually selected — the console used
     * to ask Shizuku and therefore refused to run on a device where the adb
     * channel was working perfectly.
     */
    public static final class Status {
        public final String channel;
        public final boolean ready;
        /** One line naming the state, and what to do about it when not ready. */
        public final String detail;
        /** Non-null only on the Shizuku channel; the hint copy needs it. */
        public final ShizukuExecBridge.BindingState shizuku;

        Status(String channel, boolean ready, String detail,
               ShizukuExecBridge.BindingState shizuku) {
            this.channel = channel;
            this.ready = ready;
            this.detail = detail;
            this.shizuku = shizuku;
        }
    }

    /**
     * Probe the selected channel. Blocking: callers run it off the main thread.
     *
     * The adb branch reconnects when it can, because "paired but the adb server
     * was restarted" is not something the user should have to fix by hand.
     */
    public static Status probe(Context context) {
        Context app = context(context);
        if (!CHANNEL_ADB.equals(channel(app))) {
            ShizukuExecBridge.BindingState state = ShizukuExecBridge.probeBinding(app, 8_000);
            return new Status(CHANNEL_SHIZUKU, state.ready,
                    state.ready ? app.getString(R.string.channel_shizuku_bound, state.uid)
                            : Provisioner.describeBinding(app, state),
                    state);
        }
        // A read, not an action: this runs on every console refresh, so it must not
        // start discoveries or connections. Bringing the channel up is
        // {@link #ensureBound}'s job, in the background.
        if (!LocalAdbBackend.isPaired(app)) {
            // The adb client writes a key the first time it runs at all, including for
            // a pairing the device refused, so "a key exists" is not "we are paired".
            return new Status(CHANNEL_ADB, false,
                    app.getString(LocalAdbBackend.hasKey(app)
                            ? R.string.channel_pairing_incomplete
                            : R.string.channel_not_paired), null);
        }
        if (LocalAdbBackend.serial(app).isEmpty()) {
            return new Status(CHANNEL_ADB, false,
                    app.getString(R.string.channel_no_connection), null);
        }
        if (!LocalAdbBackend.reachable(app)) {
            return new Status(CHANNEL_ADB, false,
                    app.getString(R.string.channel_unreachable, LocalAdbBackend.serial(app)),
                    null);
        }
        return new Status(CHANNEL_ADB, true,
                app.getString(R.string.channel_adb_ready, LocalAdbBackend.serial(app)), null);
    }

    /** Open the selected channel's connection, if it needs one opened eagerly. */
    public static void ensureBound(Context context) {
        Context app = context(context);
        if (!CHANNEL_ADB.equals(channel(app))) {
            ShizukuExecBridge.ensureBound(app);
            return;
        }
        // Connecting spawns a process and waits on it; callers reach here from
        // onCreate, so it happens off the main thread.
        new Thread(() -> {
            try {
                if (LocalAdbBackend.hasKey(app) && LocalAdbBackend.serial(app).isEmpty()) {
                    // A key with no remembered port is the state right after pairing,
                    // and what a pairing the app never recorded leaves behind. The port
                    // is discoverable, so ask and let the device decide whether it
                    // trusts us — "no port remembered" is not "not paired".
                    String discovered = AdbMdns.resolveBlocking(app, AdbMdns.TYPE_CONNECT, 6_000);
                    if (discovered != null) {
                        LocalAdbBackend.connect(app, discovered);
                    }
                }
                LocalAdbBackend.connectIfNeeded(app);
            } catch (Exception error) {
                // A warm-up that fails is a state to report, never a reason to die:
                // this thread has no caller to hand an exception to.
                android.util.Log.w("MidsceneActiveExec", "adb warm-up failed: " + error);
            }
        }, "adb-warmup").start();
    }

    /**
     * Make the channel usable before a caller depends on it.
     *
     * Synchronous on purpose: the provisioning path runs on a worker and must
     * report the real reason instead of racing a warm-up thread.
     */
    public static void prepare(Context context) throws IOException {
        Context app = context(context);
        if (CHANNEL_ADB.equals(channel(app))) {
            LocalAdbBackend.connectIfNeeded(app);
            return;
        }
        ShizukuExecBridge.ensureBound(app);
    }

    /**
     * Whether the selected channel can run a command *right now*.
     *
     * Reported to the agent through {@code /ready}, so it must answer about the
     * channel in use rather than about Shizuku specifically.
     */
    public static boolean isReady(Context context) {
        Context app = context(context);
        if (CHANNEL_ADB.equals(channel(app))) {
            return LocalAdbBackend.configured(app);
        }
        return ShizukuExecBridge.isReady();
    }

    public static Result exec(Context context, String command, int timeoutMs) throws IOException {
        Context app = context(context);
        if (CHANNEL_ADB.equals(channel(app))) {
            return LocalAdbBackend.shell(app, command, timeoutMs);
        }
        return Result.from(ShizukuExecBridge.exec(command, timeoutMs));
    }

    public static byte[] execBinary(Context context, String command, int timeoutMs)
            throws IOException {
        Context app = context(context);
        if (CHANNEL_ADB.equals(channel(app))) {
            return LocalAdbBackend.execOut(app, command, timeoutMs);
        }
        return ShizukuExecBridge.execBinary(command, timeoutMs);
    }

    public static byte[] readChannelFile(Context context, String path) throws IOException {
        Context app = context(context);
        if (CHANNEL_ADB.equals(channel(app))) {
            // The whole point of exec-out: `cat` streams the file back without a
            // pty re-encoding it.
            return LocalAdbBackend.execOut(app, "cat " + quote(path), 60_000);
        }
        return ShizukuExecBridge.readChannelFile(path);
    }

    public static void installYadb(Context context, byte[] bytes) throws IOException {
        Context app = context(context);
        if (CHANNEL_ADB.equals(channel(app))) {
            LocalAdbBackend.installYadb(app, bytes);
            return;
        }
        ShizukuExecBridge.installYadb(bytes);
    }

    /** One line for the diagnostics screen; names the channel and its state. */
    public static String describe(Context context) {
        Context app = context(context);
        if (!CHANNEL_ADB.equals(channel(app))) {
            ShizukuExecBridge.BindingState state = ShizukuExecBridge.probeBinding(app, 8_000);
            return state.ready
                    ? app.getString(R.string.channel_line_shizuku_ready, state.uid)
                    : "shizuku · " + Provisioner.describeBinding(app, state);
        }
        if (!LocalAdbBackend.isPaired(app)) {
            return app.getString(R.string.channel_line_adb_not_paired);
        }
        String serial = LocalAdbBackend.serial(app);
        if (serial.isEmpty()) {
            return app.getString(R.string.channel_line_adb_not_connected);
        }
        return app.getString(LocalAdbBackend.reachable(app)
                ? R.string.channel_line_adb_ready
                : R.string.channel_line_adb_unreachable, serial);
    }

    /** Shell-quote one argument; the transport sends this string to a device shell. */
    static String quote(String value) {
        return "'" + value.replace("'", "'\\''") + "'";
    }
}
