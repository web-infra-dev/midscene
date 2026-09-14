package com.midscene.localagent;

import android.os.RemoteException;
import android.os.ParcelFileDescriptor;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.FileInputStream;
import java.io.ByteArrayInputStream;
import java.util.concurrent.TimeUnit;

/**
 * Executes commands as the Shizuku shell user.
 *
 * Shizuku starts this service in its own process with elevated privileges, so the
 * commands below run as shell (uid 2000) - the same identity rish used to provide,
 * without app_process, a dex, or a file channel.
 */
public class ExecUserService extends IExecService.Stub {
    private boolean stopping;

    public ExecUserService() {
        // Refuse root-started Shizuku, even before the app can probe uid().
        if (android.os.Process.myUid() != 2000) {
            throw new SecurityException("Midscene requires shell uid 2000");
        }
        File root = new File(RuntimePayloads.CHANNEL_ROOT);
        try {
            java.nio.file.Files.createDirectories(root.toPath());
            java.nio.file.Files.setPosixFilePermissions(root.toPath(),
                    java.nio.file.attribute.PosixFilePermissions.fromString("rwx------"));
        } catch (IOException error) {
            throw new IllegalStateException("could not prepare shell channel", error);
        }
    }

    @Override
    public void destroy() {
        synchronized (this) { stopping = true; }
        ProcessTree.killChildren();
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    @Override
    public void installYadb(byte[] bytes) throws RemoteException {
        try {
            RuntimePayloads.installYadb(new File("/data/local/tmp"), bytes);
        } catch (IOException error) {
            throw new RemoteException("yadb install failed: " + error);
        }
    }

    @Override
    public ParcelFileDescriptor readChannelFile(String path) throws RemoteException {
        try {
            File file = RuntimePayloads.requireChannelFile(
                    new File(RuntimePayloads.CHANNEL_ROOT,
                            "u" + (android.os.Binder.getCallingUid() / 100000)), path);
            return PayloadPipe.open(new FileInputStream(file));
        } catch (IOException error) {
            throw new RemoteException("channel read failed: " + error);
        }
    }

    @Override
    public int uid() {
        return android.os.Process.myUid();
    }

    @Override
    public String exec(String command, int timeoutMs) throws RemoteException {
        try {
            Result result = run(command, timeoutMs);
            JSONObject json = new JSONObject();
            json.put("exitCode", result.exitCode);
            json.put("stdout", result.stdout);
            json.put("stderr", result.stderr);
            return json.toString();
        } catch (Exception error) {
            throw new RemoteException("exec failed: " + error);
        }
    }

    @Override
    public ParcelFileDescriptor execBinary(String command, int timeoutMs) throws RemoteException {
        try {
            Result result = run(command, timeoutMs);
            if (result.exitCode != 0) {
                throw new IOException("command exited " + result.exitCode + ": " + result.stderr);
            }
            if (result.stdoutBytes.length > RuntimePayloads.MAX_CHANNEL_BYTES) {
                throw new IOException("binary command output too large");
            }
            return PayloadPipe.open(new ByteArrayInputStream(result.stdoutBytes));
        } catch (Exception error) {
            throw new RemoteException("exec failed: " + error);
        }
    }

    private static final class Result {
        final int exitCode;
        final String stdout;
        final String stderr;
        final byte[] stdoutBytes;

        Result(int exitCode, byte[] stdoutBytes, String stderr) {
            this.exitCode = exitCode;
            this.stdoutBytes = stdoutBytes;
            this.stdout = new String(stdoutBytes, java.nio.charset.StandardCharsets.UTF_8);
            this.stderr = stderr;
        }
    }

    private Result run(String command, int timeoutMs) throws IOException {
        // Shell, not the caller's identity: the point of the user service.
        ProcessBuilder builder = new ProcessBuilder("sh", "-c", command);
        builder.directory(new File("/"));
        builder.redirectErrorStream(false);
        Process process;
        synchronized (this) {
            if (stopping) throw new IOException("user service is stopping");
            process = builder.start();
        }

        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        ByteArrayOutputStream stderr = new ByteArrayOutputStream();
        Thread outPump = pump(process.getInputStream(), stdout);
        Thread errPump = pump(process.getErrorStream(), stderr);

        try {
            if (!process.waitFor(Math.max(timeoutMs, 1000), TimeUnit.MILLISECONDS)) {
                process.destroy();
                throw new IOException("command timed out after " + timeoutMs + " ms");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            process.destroy();
            throw new IOException("command interrupted");
        }
        join(outPump);
        join(errPump);

        return new Result(process.exitValue(), stdout.toByteArray(),
                stderr.toString("UTF-8"));
    }

    private static Thread pump(InputStream source, ByteArrayOutputStream sink) {
        Thread thread = new Thread(() -> {
            byte[] buffer = new byte[32 * 1024];
            try {
                int read;
                while ((read = source.read(buffer)) > 0) {
                    sink.write(buffer, 0, read);
                }
            } catch (IOException ignored) {
                // the process ended; what was read is what the caller gets
            }
        }, "exec-pump");
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    private static void join(Thread thread) {
        try {
            thread.join(2000);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
