package com.midscene.localagent;

import android.content.Context;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Shared process plumbing: running the bundled Node CLI and one-off rish commands. */
public final class ShellRunner {

    private ShellRunner() {
    }

    public static final class Result {
        public final int exitCode;
        public final String output;
        public final long durationMs;

        Result(int exitCode, String output, long durationMs) {
            this.exitCode = exitCode;
            this.output = output;
            this.durationMs = durationMs;
        }

        public boolean ok() {
            return exitCode == 0;
        }
    }

    /**
     * Run the bundled CLI (`node dist/lib/cli.js …`) and stream every line to the
     * sink. `LD_LIBRARY_PATH` points at the native library directory that holds
     * the Node runtime and its dependencies.
     */
    public static Result runCli(
            Context context,
            File workingDir,
            LineSink sink,
            String... args
    ) throws IOException {
        File cli = Provisioner.cliFile(context);
        if (!new File(Provisioner.nodePath(context)).exists()) {
            throw new IOException("node runtime missing at " + Provisioner.nodePath(context));
        }
        if (!cli.exists()) {
            throw new IOException("agent bundle not extracted yet");
        }

        List<String> command = new ArrayList<>();
        command.add(Provisioner.nodePath(context));
        command.add(cli.getAbsolutePath());
        for (String arg : args) {
            command.add(arg);
        }

        ProcessBuilder builder = new ProcessBuilder(command);
        String nativeDir = context.getApplicationInfo().nativeLibraryDir;
        Map<String, String> env = builder.environment();
        env.put("LD_LIBRARY_PATH", nativeDir);
        env.put("HOME", context.getFilesDir().getAbsolutePath());
        env.put("TMPDIR", context.getCacheDir().getAbsolutePath());
        env.put("PATH", nativeDir + ":/system/bin:/system/xbin");
        env.put("MIDSCENE_RUN_DIR", new File(context.getFilesDir(), "run").getAbsolutePath());
        // rish asks Shizuku for the shell channel on behalf of this package.
        env.put("RISH_APPLICATION_ID", context.getPackageName());
        // The agent reaches the Shizuku user service through the app's loopback
        // bridge; empty values mean "not available", and the transport falls back.
        if (!ExecBridge.baseUrl().isEmpty()) {
            env.put("MIDSCENE_EXEC_BRIDGE_URL", ExecBridge.baseUrl());
            env.put("MIDSCENE_EXEC_BRIDGE_TOKEN", ExecBridge.token());
        }
        env.putAll(readEnvFile(new File(context.getFilesDir(), "model.env"), sink));
        builder.directory(workingDir);
        builder.redirectErrorStream(true);

        long startedAt = System.currentTimeMillis();
        Process process = builder.start();
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append('\n');
                if (sink != null) {
                    sink.line(line);
                }
            }
        }

        int exitCode;
        try {
            exitCode = process.waitFor();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            process.destroy();
            return new Result(-1, output.toString(), System.currentTimeMillis() - startedAt);
        }
        return new Result(exitCode, output.toString(), System.currentTimeMillis() - startedAt);
    }

    /**
     * Run one command through rish (Shizuku shell channel) and return its output.
     * Used for provisioning, where the agent runtime is not involved yet.
     */
    public static String rish(Context context, String command, LineSink sink, int timeoutMs)
            throws IOException {
        String rishPath = new File(context.getFilesDir(), "rish-path").isFile()
                ? readText(new File(context.getFilesDir(), "rish-path"))
                : "/data/local/tmp/rish";

        ProcessBuilder builder = new ProcessBuilder("sh", rishPath.trim(), "-c", command);
        String nativeDir = context.getApplicationInfo().nativeLibraryDir;
        Map<String, String> env = builder.environment();
        // Strip the loader variables: rish starts app_process, which must resolve
        // the system libraries, not ours.
        env.remove("LD_LIBRARY_PATH");
        env.remove("LD_PRELOAD");
        env.put("RISH_APPLICATION_ID", context.getPackageName());
        // The agent reaches the Shizuku user service through the app's loopback
        // bridge; empty values mean "not available", and the transport falls back.
        if (!ExecBridge.baseUrl().isEmpty()) {
            env.put("MIDSCENE_EXEC_BRIDGE_URL", ExecBridge.baseUrl());
            env.put("MIDSCENE_EXEC_BRIDGE_TOKEN", ExecBridge.token());
        }
        env.put("PATH", "/system/bin:/system/xbin");
        // rish re-executes as the shell uid, which cannot enter app-private dirs.
        builder.directory(new File("/"));
        builder.redirectErrorStream(true);

        Process process = builder.start();
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append('\n');
                if (sink != null) {
                    sink.line(line);
                }
            }
        }

        try {
            if (!process.waitFor(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                throw new IOException("rish command timed out after " + timeoutMs + " ms");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            throw new IOException("rish command interrupted");
        }
        return output.toString();
    }

    private static Map<String, String> readEnvFile(File file, LineSink sink) {
        Map<String, String> values = new java.util.HashMap<>();
        if (!file.exists()) {
            return values;
        }
        for (String line : readText(file).split("\n")) {
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
        if (!values.isEmpty() && sink != null) {
            sink.line("model.env: injecting " + values.size() + " variables");
        }
        return values;
    }

    public static String readText(File file) {
        try {
            return new String(java.nio.file.Files.readAllBytes(file.toPath()),
                    StandardCharsets.UTF_8);
        } catch (IOException error) {
            return "";
        }
    }

    public interface LineSink {
        void line(String line);
    }

}
