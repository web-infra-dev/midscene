package com.midscene.localagent;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Runtime provisioning: everything the agent needs is inside the APK and gets
 * materialised on the device.
 *
 * Two destinations matter:
 * - the agent bundle and JS files go to app-private storage (only the app reads them);
 * - yadb must end up in /data/local/tmp for the shell uid, and the app cannot write
 *   there (SELinux), so it is staged in the app's *external* files directory —
 *   which the shell can read — and copied by rish.
 */
public final class Provisioner {

    private static final String TAG = "MidsceneProvisioner";
    public static final String YADB_TARGET = "/data/local/tmp/yadb";

    private static final Map<String, Boolean> RUNNING = new ConcurrentHashMap<>();

    private Provisioner() {
    }

    public static boolean isBusy(String key) {
        return RUNNING.containsKey(key);
    }

    public static File agentDir(Context context) {
        return new File(context.getFilesDir(), "agent");
    }

    public static File cliFile(Context context) {
        return new File(agentDir(context),
                "node_modules/@midscene/android-local/dist/lib/cli.js");
    }

    public static String nodePath(Context context) {
        return context.getApplicationInfo().nativeLibraryDir + "/libnodebin.so";
    }

    /**
     * Unpack the agent bundle. Re-extracts when the APK carries a different
     * bundle stamp, so an app update never keeps running a stale agent.
     */
    public static boolean extractAgent(Context context, LogSink log) throws IOException {
        String stamp = readAssetText(context, "bundle-info.txt");
        File stampFile = new File(agentDir(context), ".bundle-info");
        String installed = stampFile.isFile() ? ShellRunner.readText(stampFile).trim() : "";

        if (cliFile(context).exists() && !stamp.isEmpty() && stamp.equals(installed)) {
            log.log("agent bundle up to date (" + stamp + ")");
            return false;
        }
        if (cliFile(context).exists() && stamp.isEmpty()) {
            log.log("agent bundle already extracted (no stamp in APK)");
            return false;
        }

        File target = agentDir(context);
        target.mkdirs();
        long startedAt = System.currentTimeMillis();
        try (InputStream raw = context.getAssets().open("agent-bundle.zip");
             java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(raw)) {
            java.util.zip.ZipEntry entry;
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
        try (FileOutputStream out = new FileOutputStream(stampFile)) {
            out.write(stamp.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        log.log("extracted agent bundle in " + (System.currentTimeMillis() - startedAt)
                + " ms (" + (stamp.isEmpty() ? "unstamped" : stamp) + ")");
        return true;
    }

    private static String readAssetText(Context context, String name) {
        try (InputStream raw = context.getAssets().open(name)) {
            byte[] buffer = new byte[1024];
            int read = raw.read(buffer);
            return read <= 0 ? "" : new String(buffer, 0, read,
                    java.nio.charset.StandardCharsets.UTF_8).trim();
        } catch (IOException error) {
            return "";
        }
    }

    /** Copy the bundled yadb dex into the app's external files directory. */
    public static File stageYadb(Context context, LogSink log) throws IOException {
        File external = context.getExternalFilesDir(null);
        if (external == null) {
            throw new IOException("external files directory is unavailable");
        }
        if (!external.exists() && !external.mkdirs()) {
            throw new IOException("could not create " + external);
        }

        File staged = new File(external, "yadb");
        try (InputStream raw = context.getAssets().open("yadb");
             FileOutputStream out = new FileOutputStream(staged)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = raw.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
        }
        log.log("staged yadb at " + staged.getAbsolutePath()
                + " (" + staged.length() + " bytes)");
        return staged;
    }

    /**
     * Install yadb into /data/local/tmp through the shell channel. Requires
     * Shizuku authorization, which the first rish call triggers.
     */
    public static String installYadb(Context context, LogSink log) throws IOException {
        File staged = stageYadb(context, log);

        ShizukuExecBridge.ensureBound(context);
        if (ShizukuExecBridge.waitUntilReady(20_000)) {
            String command = String.format(
                    "cp '%s' %s && chmod 644 %s && ls -l %s",
                    staged.getAbsolutePath(), YADB_TARGET, YADB_TARGET, YADB_TARGET);
            ShizukuExecBridge.Result result = ShizukuExecBridge.exec(command, 30_000);
            log.log("shizuku user service: " + result.stdout.trim()
                    + (result.stderr.isEmpty() ? "" : " stderr=" + result.stderr.trim()));
            if (!result.ok()) {
                throw new IOException("yadb install failed (exit " + result.exitCode + ")"
                        + (result.stderr.isEmpty() ? "" : ": " + result.stderr.trim()));
            }
            return YADB_TARGET;
        }
        log.log("user service not ready (" + ShizukuExecBridge.lastError()
                + "); falling back to rish");

        String command = String.format(
                "cp '%s' %s && chmod 644 %s && test -f %s && echo yadb-installed",
                staged.getAbsolutePath(), YADB_TARGET, YADB_TARGET, YADB_TARGET);
        String output = ShellRunner.rish(context, command, log, 30_000);
        if (!output.contains("yadb-installed")) {
            throw new IOException("yadb install failed: " + output.trim());
        }
        return YADB_TARGET;
    }

    /** Sink for provisioning output; also usable as a shell line sink. */
    public interface LogSink extends ShellRunner.LineSink {
        default void log(String line) {
            line(line);
        }
    }
}
