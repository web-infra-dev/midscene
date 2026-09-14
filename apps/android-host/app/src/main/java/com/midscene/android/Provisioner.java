package com.midscene.android;

import android.content.Context;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

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
 *   there (SELinux), so bounded asset bytes go through Binder to UserService.
 *   No cross-user external storage access is required.
 */
public final class Provisioner {

    private static final String TAG = "MidsceneProvisioner";
    public static final String YADB_TARGET = "/data/local/tmp/yadb";

    /**
     * Where the CLI sits inside the extracted bundle.
     *
     * The bundle's root is the staging install itself (`node_modules`, `examples`,
     * `package.json`), so the CLI is inside the workspace package rather than at
     * `dist/lib/cli.js`. Extraction and every runtime lookup read this one constant:
     * when only the extractor learned the new layout, provisioning reported
     * "extracted agent bundle in 1256 ms" while the run path kept failing with
     * "agent bundle not extracted yet" and Diagnostics showed "missing".
     */
    public static final String BUNDLE_CLI_PATH =
            "node_modules/@midscene/android-local/dist/lib/cli.js";

    private static final Map<String, Boolean> RUNNING = new ConcurrentHashMap<>();

    private Provisioner() {
    }

    public static boolean isBusy(String key) {
        return RUNNING.containsKey(key);
    }

    /** Shell-owned payload directory; reads return via a Binder descriptor pipe. */
    public static File channelDir(Context context) {
        return new File(RuntimePayloads.CHANNEL_ROOT,
                "u" + (context.getApplicationInfo().uid / 100000));
    }

    public static File agentDir(Context context) {
        return new File(context.getFilesDir(), "agent");
    }

    /** Installation receipt, not a substitute for checking live Shizuku binding. */
    public static boolean runtimeInstalled(Context context) {
        File receipt = new File(context.getFilesDir(), "runtime-ready");
        try {
            return new File(nodePath(context)).isFile() && cliFile(context).isFile()
                    && receipt.isFile()
                    && new String(java.nio.file.Files.readAllBytes(receipt.toPath()),
                    java.nio.charset.StandardCharsets.UTF_8).trim().equals(runtimeStamp(context));
        } catch (IOException error) {
            return false;
        }
    }

    private static String runtimeStamp(Context context) {
        return "userservice-pipe-v2:" + readAssetText(context, "bundle-info.txt");
    }

    public static File cliFile(Context context) {
        return new File(agentDir(context), BUNDLE_CLI_PATH);
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
        File next = new File(context.getFilesDir(), "agent-next");
        deleteTree(next);
        if (!next.mkdirs()) {
            throw new IOException("could not create " + next);
        }
        long startedAt = System.currentTimeMillis();
        try (InputStream raw = context.getAssets().open("agent-bundle.zip");
             java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(raw)) {
            java.util.zip.ZipEntry entry;
            byte[] buffer = new byte[64 * 1024];
            while ((entry = zip.getNextEntry()) != null) {
                File out = new File(next, entry.getName());
                if (!out.getCanonicalPath().startsWith(next.getCanonicalPath() + File.separator)) {
                    throw new IOException("unsafe bundle entry: " + entry.getName());
                }
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
        restoreLinks(next);
        // Check the CLI at the exact path the runtime will read it from, so a bundle
        // that extracts but cannot run fails here instead of on the next run.
        File stagedCli = new File(next, BUNDLE_CLI_PATH);
        if (!stagedCli.isFile()) {
            throw new IOException("agent bundle has no CLI at " + BUNDLE_CLI_PATH);
        }
        deleteTree(target);
        if (!next.renameTo(target)) {
            throw new IOException("could not install agent bundle");
        }
        // Post-condition, read through the same accessor the run path and Diagnostics
        // use: "extracted" must mean "the CLI is where the app will look for it".
        if (!cliFile(context).isFile()) {
            throw new IOException("agent bundle installed without a CLI at "
                    + cliFile(context).getAbsolutePath());
        }
        try (FileOutputStream out = new FileOutputStream(stampFile)) {
            out.write(stamp.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        log.log("extracted agent bundle in " + (System.currentTimeMillis() - startedAt)
                + " ms (" + (stamp.isEmpty() ? "unstamped" : stamp) + ")");
        return true;
    }

    private static void restoreLinks(File root) throws IOException {
        // Bundles no longer ship a link manifest: links are materialised when the
        // bundle is built, so there is nothing to restore. A manifest is still honoured
        // for older bundles.
        File manifest = new File(root, "bundle-links.json");
        if (!manifest.isFile()) {
            return;
        }

        try {
            JSONArray links = new JSONArray(ShellRunner.readText(manifest));
            for (int index = 0; index < links.length(); index++) {
                JSONObject item = links.getJSONObject(index);
                String relative = item.getString("path");
                String target = item.getString("target");
                File link = new File(root, relative);
                File destination = new File(link.getParentFile(), target);
                String safeRoot = root.getCanonicalPath() + File.separator;
                if (!relative.startsWith("node_modules/")
                        || !link.getCanonicalPath().startsWith(safeRoot)
                        || !destination.getCanonicalPath().startsWith(safeRoot)) {
                    throw new IOException("unsafe bundle link: " + relative);
                }
                link.getParentFile().mkdirs();
                java.nio.file.Files.createSymbolicLink(
                        link.toPath(), destination.toPath());
            }
        } catch (JSONException error) {
            throw new IOException("invalid bundle-links.json", error);
        }
    }

    private static void deleteTree(File directory) throws IOException {
        if (!directory.exists()) {
            return;
        }
        try (java.util.stream.Stream<java.nio.file.Path> paths =
                     java.nio.file.Files.walk(directory.toPath())) {
            for (java.nio.file.Path path : (Iterable<java.nio.file.Path>)
                    paths.sorted(java.util.Comparator.reverseOrder())::iterator) {
                java.nio.file.Files.deleteIfExists(path);
            }
        }
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

    /**
     * Install yadb into /data/local/tmp through the shell channel.
     *
     * The Shizuku user service is the only privilege path: there is no fallback
     * to spawning a `rish` script from this process (that call is aborted on
     * Android 14, so the fallback could only turn a clear "not ready" into a
     * confusing failure later).
     */
    public static String installYadb(Context context, LogSink log) throws IOException {
        // Bring the channel up first: for the adb channel "configured" is not the
        // same as "connected", and the difference is the whole reason a first
        // provisioning used to fail with a message about the wrong thing.
        ActiveExec.prepare(context);
        // Probe rather than wait: a bare "not ready" used to be reported with an
        // empty reason, which told the user nothing about what to fix.
        if (!ActiveExec.isReady(context)) {
            throw new IOException("the execution channel is not ready: "
                    + ActiveExec.describe(context));
        }
        log.log("execution channel: " + ActiveExec.describe(context));

        byte[] bytes;
        try (InputStream raw = context.getAssets().open("yadb")) {
            bytes = RuntimePayloads.readBounded(raw, RuntimePayloads.MAX_YADB_BYTES);
        }
        ActiveExec.installYadb(context, bytes);
        ActiveExec.Result result = ActiveExec.exec(context,
                "ls -l " + YADB_TARGET, 10_000);
        log.log("yadb: " + result.stdout.trim()
                + (result.stderr.isEmpty() ? "" : " stderr=" + result.stderr.trim()));
        if (!result.ok()) {
            throw new IOException("yadb install failed (exit " + result.exitCode + ")"
                    + (result.stderr.isEmpty() ? "" : ": " + result.stderr.trim()));
        }
        return YADB_TARGET;
    }

    /** Never report a partial install as a working runtime. */
    public static void installRuntime(Context context, LogSink log) throws IOException {
        File receipt = new File(context.getFilesDir(), "runtime-ready");
        java.nio.file.Files.deleteIfExists(receipt.toPath());
        extractAgent(context, log);
        installYadb(context, log);
        ShellRunner.Result version = ShellRunner.runCli(context, context.getFilesDir(), log, "--version");
        requireCliSuccess(version.exitCode);
        // Deliberately exceed Binder's transaction buffer to verify that only
        // descriptors cross it. Actual Node/HTTP/screenshot coverage follows.
        String channel = channelDir(context).getAbsolutePath();
        int expectedBytes = 2 * 1024 * 1024;
        ActiveExec.Result write = ActiveExec.exec(context,
                "mkdir -p '" + channel + "' && dd if=/dev/zero of='"
                        + channel + "/provision-check' bs=65536 count=32", 10_000);
        if (!write.ok()) {
            throw new IOException("runtime channel write failed: " + write.stderr);
        }
        byte[] read = ActiveExec.readChannelFile(context, channel + "/provision-check");
        if (read.length != expectedBytes || !java.util.Arrays.equals(read, new byte[expectedBytes])) {
            throw new IOException("runtime channel read verification failed");
        }
        ActiveExec.Result cleanup = ActiveExec.exec(context,
                "rm -f '" + channel + "/provision-check'", 10_000);
        if (!cleanup.ok()) {
            throw new IOException("runtime channel test cleanup failed: " + cleanup.stderr);
        }
        log.log("verified " + read.length + " byte payload pipe");
        log.log("verifying on-device bridge and screenshot (no model calls or input actions)");
        ShellRunner.Result doctor = ShellRunner.runCli(context, context.getFilesDir(), log, "doctor");
        if (!doctor.ok()) {
            throw new IOException("runtime doctor failed (exit " + doctor.exitCode + ")");
        }
        java.nio.file.Files.write(receipt.toPath(), runtimeStamp(context).getBytes(
                java.nio.charset.StandardCharsets.UTF_8));
        log.log("runtime ready: Node + agent + shell uid 2000 + yadb + payload pipe");
    }

    static void requireCliSuccess(int exitCode) throws IOException {
        if (exitCode != 0) {
            throw new IOException("agent CLI verification failed (exit " + exitCode + ")");
        }
    }

    /**
     * Turn a binding state into the one sentence the user has to act on.
     *
     * The reason and the status code are both reported: the reason names the
     * operation that failed, the code says which stage it failed at, and neither
     * alone is enough to tell "never started" from "started and died".
     *
     * Package-private because {@link ActiveExec} reports the same sentence for the
     * Shizuku channel rather than inventing a second wording for it.
     */
    static String describeBinding(android.content.Context context,
                                  ShizukuExecBridge.BindingState state) {
        StringBuilder message = new StringBuilder();
        if (!state.binder) {
            message.append(context.getString(R.string.channel_shizuku_no_binder));
        } else if (!state.authorized) {
            message.append(context.getString(R.string.channel_shizuku_not_authorized));
        } else if (state.serviceFailure != null && !state.serviceFailure.isEmpty()) {
            // The bridge's own words: a binder failure is a diagnostic, not copy.
            message.append(state.serviceFailure);
        } else if (state.reason != null && !state.reason.isEmpty()) {
            message.append(state.reason);
        } else {
            message.append(context.getString(R.string.channel_shizuku_no_service));
        }
        message.append(" [peek status ").append(state.serviceStatus).append(']');
        return message.toString();
    }

    /** Sink for provisioning output; also usable as a shell line sink. */
    public interface LogSink extends ShellRunner.LineSink {
        default void log(String line) {
            line(line);
        }
    }
}
