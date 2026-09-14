package com.midscene.android;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * The execution channel that does not need Shizuku: the app's own adb client
 * talking to the device's own adbd over the wireless-debugging loopback port.
 *
 * Why this exists: some ROMs strip {@code GRANT_RUNTIME_PERMISSIONS} from the
 * shell user. Shizuku records a client's authorization by granting itself a
 * runtime permission, so on those devices it can never authorize anyone — but
 * every command the agent actually runs (screencap, input, am, dumpsys) still
 * works for shell. Pairing an adb client with the local adbd needs no runtime
 * permission at all, so this channel reaches the same uid 2000 without asking
 * the ROM for anything it has taken away.
 *
 * The client is AOSP's own {@code adb}, delivered as a native library
 * (libadbbin.so) with its dependencies beside it — the same packaging rule the
 * Node runtime follows, because Android 10+ only allows execve from lib/&lt;abi&gt;.
 */
public final class LocalAdbBackend {

    private static final String TAG = "MidsceneLocalAdb";
    private static final String PREF_FILE = "midscene-adb";
    private static final String KEY_SERIAL = "serial";
    private static final String KEY_PAIRED = "paired";

    /**
     * The port this app's adb server listens on.
     *
     * Deliberately not 5037: that port belongs to whoever asked for it first, and
     * the server it holds decides which key everything else authenticates with.
     */
    private static final int SERVER_PORT = 5038;

    private LocalAdbBackend() {
    }

    /** The adb client binary, in the one directory Android still executes from. */
    public static File binary(Context context) {
        return new File(context.getApplicationInfo().nativeLibraryDir, "libadbbin.so");
    }

    /**
     * adb keeps its key pair in {@code $HOME/.android}. Pointing HOME inside the
     * app's private storage keeps that key with the app, so uninstalling revokes
     * the pairing with it.
     */
    static File homeDir(Context context) {
        File home = new File(context.getFilesDir(), "adb-home");
        if (!home.isDirectory() && !home.mkdirs()) {
            android.util.Log.w(TAG, "could not create " + home);
        }
        File keys = new File(home, ".android");
        if (!keys.isDirectory() && !keys.mkdirs()) {
            android.util.Log.w(TAG, "could not create " + keys);
        }
        return home;
    }

    public static String serial(Context context) {
        return context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
                .getString(KEY_SERIAL, "");
    }

    public static void setSerial(Context context, String serial) {
        context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
                .edit().putString(KEY_SERIAL, serial == null ? "" : serial).apply();
    }

    public static boolean hasKey(Context context) {
        return new File(homeDir(context), ".android/adbkey").isFile();
    }

    /**
     * Whether this device has actually accepted our key.
     *
     * Not the same question as {@link #hasKey}: the adb client generates a key
     * pair the first time it runs at all, including on a pairing attempt the
     * device rejected. Reading "a key file exists" as "we are paired" made the
     * console announce a pairing that had failed and offered a Reconnect that
     * could not possibly work.
     *
     * Only two things set this, and both are the device answering: a pairing the
     * device confirmed, and a connection it allowed.
     */
    public static boolean isPaired(Context context) {
        return context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
                .getBoolean(KEY_PAIRED, false);
    }

    static void setPaired(Context context, boolean paired) {
        context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_PAIRED, paired).apply();
    }

    /**
     * Drop the remembered port, and keep the pairing.
     *
     * The port is the half that moves: wireless debugging picks a new one whenever it
     * restarts, and a remembered value that has stopped working is a dead end that every
     * later reconnect would dial again. Forgetting it makes the next attempt resolve the
     * current port instead. The key pair is untouched, so no new pairing code is needed
     * — which is the whole point of separating the two.
     */
    public static void forgetSerial(Context context) {
        context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
                .edit().remove(KEY_SERIAL).apply();
    }

    /** Whether a serial is remembered; being reachable is a separate question. */
    public static boolean configured(Context context) {
        return isPaired(context) && !serial(context).isEmpty();
    }

    /**
     * Pair with the port shown under "Pair device with pairing code".
     *
     * The pairing code is displayed on this same screen; the app never reads it
     * itself, the user types it. That is the whole authorization step for this
     * channel — there is no dialog to grant and nothing the ROM can withhold.
     */
    public static ActiveExec.Result pair(Context context, String hostPort, String code)
            throws IOException {
        String target = normalize(hostPort);
        if (target.isEmpty()) {
            throw new IOException(context.getString(R.string.adb_error_pairing_address));
        }
        if (code == null || !code.trim().matches("\\d{6}")) {
            throw new IOException(context.getString(R.string.adb_error_pairing_code));
        }
        // Starting the server (idempotent) rather than replacing it: -P puts it on a
        // port nothing else uses, so there is no foreign server to displace, and a
        // kill here only opens a window in which the command that follows talks to a
        // daemon that is still coming up — which reports itself as
        // "protocol fault (couldn't read status length)".
        startServer(context);
        ActiveExec.Result result =
                run(context, Arrays.asList("pair", target, code.trim()), 60_000);
        String output = (result.stdout + result.stderr).trim();
        // The device is the only authority on whether pairing happened; "the command
        // exited 0" is not the same statement.
        if (!result.ok() || !output.contains("Successfully paired")) {
            // The client's own words, in the log as well as the notification: this is
            // the message that says whether the port was stale, the code wrong, or the
            // server not up yet.
            android.util.Log.w(TAG, "adb pair (exit " + result.exitCode + "): " + output);
            throw new IOException(context.getString(R.string.adb_error_pairing_rejected,
                    output));
        }
        setPaired(context, true);
        return result;
    }

    /**
     * Connect to a listening adbd port.
     *
     * A TCP connection is not an authorized one. adbd accepts the socket first and
     * then decides about the key: if it does not know ours it puts an "Allow USB
     * debugging?" prompt on the screen and answers {@code unauthorized} until the
     * user accepts. So "connected" alone must not be recorded as paired — only a
     * shell that answers as uid 2000 proves the device trusts this key.
     *
     * That check is also what makes the no-code path work: on a device whose adbd
     * already listens on a port (an "ADB over network" switch, or 5555 after
     * {@code adb tcpip 5555}), connecting and approving the prompt is a complete
     * setup with no pairing code involved.
     */
    public static ActiveExec.Result connect(Context context, String hostPort) throws IOException {
        String target = normalize(hostPort);
        if (target.isEmpty()) {
            throw new IOException(context.getString(R.string.adb_error_connection_address));
        }
        ActiveExec.Result result = run(context, Arrays.asList("connect", target), 30_000);
        String output = (result.stdout + result.stderr).trim();
        if (!result.ok() || !output.contains("connected")) {
            throw new IOException(context.getString(R.string.adb_error_connect_failed,
                    output));
        }
        // Probe over the transport that was just connected to. The remembered serial
        // is only written once the device has answered, so at this point there is
        // nothing remembered to name it with — and asking `shell` for it used to throw
        // on the first connection after pairing, taking the app down with it.
        ActiveExec.Result probe = run(context, Arrays.asList("-s", target, "shell", "id"),
                15_000);
        if (!probe.ok() || !probe.stdout.contains("uid=2000")) {
            String detail = (probe.stdout + probe.stderr).trim();
            if (detail.contains("unauthorized")) {
                throw new IOException(context.getString(R.string.adb_error_authorize, target));
            }
            throw new IOException(context.getString(R.string.adb_error_shell_uid,
                    target, detail));
        }
        setSerial(context, target);
        setPaired(context, true);
        return result;
    }

    /** Accept "36117", "127.0.0.1:36117" and the LAN address shown on screen. */
    static String normalize(String hostPort) {
        if (hostPort == null) {
            return "";
        }
        String value = hostPort.trim();
        if (value.isEmpty()) {
            return "";
        }
        if (!value.contains(":")) {
            return "127.0.0.1:" + value;
        }
        // A device reached over its own Wi-Fi address is the same device; using
        // loopback keeps the traffic off the network.
        int colon = value.lastIndexOf(':');
        return "127.0.0.1:" + value.substring(colon + 1);
    }

    /**
     * The connect targets to try, best first: what the user typed, then the ports mDNS
     * is advertising now (this phone's own, newest first), then the port remembered from
     * the last session, then answers that came from somebody else's device.
     *
     * A list rather than one address because no single source is authoritative: mDNS
     * answers out of a cache that can hold a port the phone has already dropped, and the
     * remembered port is from a previous session by definition.
     */
    public static List<String> connectCandidates(Context context, String typedTarget) {
        List<String> preferred = new ArrayList<>();
        String typed = normalize(typedTarget);
        if (!typed.isEmpty()) {
            preferred.add(typed);
        }
        List<String> fallback = new ArrayList<>();
        String serial = serial(context);
        if (!serial.isEmpty()) {
            fallback.add(serial);
        }
        return AdbMdns.candidateTargets(context, AdbMdns.TYPE_CONNECT, preferred, fallback);
    }

    /**
     * Connect to the first candidate that answers as uid 2000.
     *
     * Every candidate is verified the same way the single-address path always was — a
     * TCP connection is not an authorized one — so trying a dead port costs one refused
     * connect (milliseconds) and trying the wrong one cannot silently succeed.
     *
     * @return the target that worked
     * @throws IOException the first candidate's failure, which is the one that says most
     *                     about the state the caller believed in
     */
    public static String connectFirstWorking(Context context, List<String> candidates)
            throws IOException {
        if (candidates == null || candidates.isEmpty()) {
            throw new IOException(context.getString(R.string.adb_error_connection_address));
        }
        IOException firstFailure = null;
        for (String candidate : candidates) {
            try {
                connect(context, candidate);
                if (!candidate.equals(candidates.get(0))) {
                    android.util.Log.i(TAG, "connected to " + candidate + " after "
                            + candidates.get(0) + " did not answer");
                }
                return candidate;
            } catch (IOException failure) {
                if (firstFailure == null) {
                    firstFailure = failure;
                }
                android.util.Log.w(TAG, "candidate " + candidate + " did not connect: "
                        + failure.getMessage());
            }
        }
        throw firstFailure;
    }

    /** Start the server if it is not running, and wait until it answers. */
    static void startServer(Context context) throws IOException {
        run(context, java.util.Collections.singletonList("start-server"), 30_000);
    }

    /**
     * Bring the adb server up before it is needed.
     *
     * Starting it is the slow half of the first pairing command, and this ROM freezes
     * the app (and the child process running that command) a few seconds after the
     * pairing broadcast is handled — so the work has to happen while the user is still
     * in the app, not while they are typing the code.
     */
    public static void warmServer(Context context) {
        Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                startServer(app);
                android.util.Log.i(TAG, "adb server warmed");
            } catch (IOException error) {
                android.util.Log.w(TAG, "could not warm the adb server: " + error);
            }
        }, "adb-warm-server").start();
    }

    /** Stop the host-side adb server this app started. */
    public static void killServer(Context context) throws IOException {
        run(context, java.util.Collections.singletonList("kill-server"), 15_000);
    }

    /**
     * Make sure the server on {@link #SERVER_PORT} is one this app started, and that
     * it is ready to answer.
     *
     * adb keeps a single server per port and, by design, the first client to ask owns
     * it. That client's HOME decides which key the server pairs with and
     * authenticates with, so a server started elsewhere — a leftover from a previous
     * install, another adb tool — silently makes every later command use a key this
     * app does not have.
     *
     * The start-server that follows the kill is not optional: a command issued in the
     * gap while the new daemon is coming up fails with "protocol fault (couldn't read
     * status message)", which says nothing about the real cause.
     */
    static void claimServer(Context context) {
        try {
            killServer(context);
        } catch (IOException error) {
            android.util.Log.i(TAG, "no server to replace: " + error.getMessage());
        }
        try {
            startServer(context);
        } catch (IOException error) {
            android.util.Log.w(TAG, "could not start the adb server: " + error.getMessage());
        }
    }

    /**
     * Re-establish the connection if it is not usable.
     *
     * Wireless debugging keeps its port while the toggle stays on, but the adb server
     * this app runs does not survive everything — and the pairing key makes reconnecting
     * silent, so there is no reason to ask the user. The port, though, is re-picked by
     * the ROM whenever wireless debugging restarts, so a remembered port that no longer
     * answers is forgotten rather than dialled again on every later attempt.
     */
    public static boolean connectIfNeeded(Context context) throws IOException {
        if (serial(context).isEmpty()) {
            return false;
        }
        if (reachable(context)) {
            return true;
        }
        List<String> candidates = connectCandidates(context, null);
        try {
            connectFirstWorking(context, candidates);
            return true;
        } catch (IOException firstAttempt) {
            // The most common reason a connect that used to work stops working is
            // that the server was replaced by one holding a different key. Take it
            // back and try once more before reporting anything to the user.
            claimServer(context);
            try {
                connectFirstWorking(context, candidates);
                return true;
            } catch (IOException secondAttempt) {
                // The other reason is the port itself, and remembering a dead one only
                // makes the next attempt fail the same way.
                forgetSerial(context);
                throw secondAttempt;
            }
        }
    }

    /** Probe the remembered serial without failing when it is not reachable. */
    public static boolean reachable(Context context) {
        String serial = serial(context);
        if (serial.isEmpty()) {
            return false;
        }
        try {
            ActiveExec.Result result = shell(context, "id", 15_000);
            return result.ok() && result.stdout.contains("uid=2000");
        } catch (IOException error) {
            android.util.Log.w(TAG, "probe failed: " + error);
            return false;
        }
    }

    /**
     * Name the transport explicitly instead of letting adb pick the only device.
     *
     * "The only device" is an assumption that holds until the adb server sees a
     * second one, and then every command silently targets the wrong transport.
     */
    private static List<String> deviceArgs(Context context) throws IOException {
        String serial = serial(context);
        if (serial.isEmpty()) {
            // A failure the callers already report, not something that should escape a
            // worker thread as an unchecked crash: "not connected yet" is a state this
            // channel spends real time in, not a bug.
            throw new IOException("no adb serial configured; connect to the device first");
        }
        return Arrays.asList("-s", serial);
    }

    private static List<String> withDevice(Context context, List<String> arguments)
            throws IOException {
        List<String> command = new ArrayList<>(deviceArgs(context));
        command.addAll(arguments);
        return command;
    }

    static ActiveExec.Result shell(Context context, String command, int timeoutMs)
            throws IOException {
        return run(context, withDevice(context, Arrays.asList("shell", command)), timeoutMs);
    }

    /**
     * Raw stdout, no pty and no CRLF translation — this is the path screenshots
     * travel, and a mangled PNG is the classic symptom of using the wrong one.
     */
    static byte[] execOut(Context context, String command, int timeoutMs) throws IOException {
        return runBinary(context, withDevice(context, Arrays.asList("exec-out", command)), timeoutMs);
    }

    /** Replace /data/local/tmp/yadb with the bundled dex. */
    static void installYadb(Context context, byte[] bytes) throws IOException {
        File staged = new File(context.getCacheDir(), "yadb");
        try (FileOutputStream out = new FileOutputStream(staged)) {
            out.write(bytes);
        }
        // adb push goes through the sync service in adbd, which runs as shell, so
        // the file lands owned by shell without this app touching that directory.
        ActiveExec.Result push = run(context,
                Arrays.asList("push", staged.getAbsolutePath(), Provisioner.YADB_TARGET), 60_000);
        staged.delete();
        String output = (push.stdout + push.stderr).trim();
        if (!push.ok() || output.contains("error") || output.contains("failed")) {
            throw new IOException("adb push of yadb failed: " + output);
        }
        ActiveExec.Result mode = shell(context, "chmod 644 " + Provisioner.YADB_TARGET, 15_000);
        if (!mode.ok()) {
            throw new IOException("chmod on " + Provisioner.YADB_TARGET + " failed: "
                    + (mode.stderr.isEmpty() ? mode.stdout : mode.stderr));
        }
    }

    private static List<String> baseCommand(Context context) {
        List<String> command = new ArrayList<>();
        command.add(binary(context).getAbsolutePath());
        // A server port of this app's own.
        //
        // adb keeps one server per port and the first client to ask owns it —
        // including the key pair in that client's HOME. Sharing the default 5037
        // with anything else on the phone (Termux, another adb app, a manual test)
        // therefore means pairing and connecting with a key this app does not have,
        // and the failure comes back as a protocol error that names none of that.
        command.add("-P");
        command.add(String.valueOf(SERVER_PORT));
        return command;
    }

    /**
     * The environment every adb invocation needs.
     *
     * HOME keeps adb's key pair inside the app's private storage. LD_LIBRARY_PATH
     * is set even though the libraries sit next to the binary in lib/&lt;abi&gt;:
     * the adb build carries a DT_RUNPATH pointing at the Termux prefix it was
     * packaged for, and relying on the loader's default search path instead of
     * saying where they are is the kind of assumption that breaks on the one ROM
     * that orders the search differently.
     */
    private static void applyEnvironment(ProcessBuilder builder, Context context) {
        builder.environment().put("HOME", homeDir(context).getAbsolutePath());
        builder.environment().put("LD_LIBRARY_PATH",
                context.getApplicationInfo().nativeLibraryDir);
    }

    private static ActiveExec.Result run(Context context, List<String> arguments, long timeoutMs)
            throws IOException {
        ProcessBuilder builder = new ProcessBuilder(withArgs(context, arguments));
        applyEnvironment(builder, context);
        Process process = builder.start();
        process.getOutputStream().close();

        StreamCollector errors = new StreamCollector(process.getErrorStream());
        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        copy(process.getInputStream(), stdout);
        int exitCode = waitFor(process, timeoutMs);
        byte[] errorBytes = errors.finish();
        return new ActiveExec.Result(
                exitCode,
                stdout.toString(StandardCharsets.UTF_8.name()),
                new String(errorBytes, StandardCharsets.UTF_8));
    }

    private static byte[] runBinary(Context context, List<String> arguments, long timeoutMs)
            throws IOException {
        ProcessBuilder builder = new ProcessBuilder(withArgs(context, arguments));
        applyEnvironment(builder, context);
        Process process = builder.start();
        process.getOutputStream().close();

        StreamCollector errors = new StreamCollector(process.getErrorStream());
        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        copy(process.getInputStream(), stdout);
        int exitCode = waitFor(process, timeoutMs);
        errors.finish();
        if (exitCode != 0) {
            throw new IOException("adb exited " + exitCode);
        }
        return stdout.toByteArray();
    }

    private static List<String> withArgs(Context context, List<String> arguments) {
        List<String> command = baseCommand(context);
        command.addAll(arguments);
        return command;
    }

    private static int waitFor(Process process, long timeoutMs) throws IOException {
        try {
            if (!process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                throw new IOException("adb timed out after " + timeoutMs + " ms");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            throw new IOException("interrupted while waiting for adb", interrupted);
        }
        return process.exitValue();
    }

    private static void copy(InputStream source, ByteArrayOutputStream sink) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = source.read(buffer)) > 0) {
            sink.write(buffer, 0, read);
        }
    }

    /** Reads a stream on its own thread so a full pipe cannot deadlock the wait. */
    private static final class StreamCollector {
        private final ByteArrayOutputStream sink = new ByteArrayOutputStream();
        private final Thread thread;

        StreamCollector(InputStream source) {
            this.thread = new Thread(() -> {
                try {
                    copy(source, sink);
                } catch (IOException ignored) {
                    // The process died; whatever was collected is still reported.
                }
            }, "adb-stderr");
            this.thread.setDaemon(true);
            this.thread.start();
        }

        byte[] finish() {
            try {
                thread.join(5_000);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            return sink.toByteArray();
        }
    }
}
