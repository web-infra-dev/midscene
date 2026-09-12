package com.midscene.localagent;

import android.content.ComponentName;
import android.content.Context;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.IBinder;

import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import rikka.shizuku.Shizuku;

/**
 * Privileged command execution for the agent.
 *
 * Binds the {@link ExecUserService} that Shizuku runs for this app and forwards
 * commands to it. This replaces rish: `Shizuku.newProcess` is private in API
 * 13.1.5, and a rish call from an app process is aborted on Android 14, so a user
 * service is the only supported route to a shell(2000) process.
 *
 * Call {@link #ensureBound(Context)} early (activity and service startup); the
 * binding is asynchronous and completes as soon as Shizuku hands over the binder.
 */
public final class ShizukuExecBridge {

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
    }

    private static final AtomicReference<IExecService> SERVICE = new AtomicReference<>();
    private static final AtomicReference<CountDownLatch> PENDING = new AtomicReference<>();
    private static volatile boolean binding;
    private static volatile String lastError = "";
    private static volatile boolean listenerRegistered;

    private ShizukuExecBridge() {
    }

    public static boolean isReady() {
        return SERVICE.get() != null;
    }

    public static String lastError() {
        return lastError;
    }

    public static boolean shizukuAuthorized() {
        try {
            return !Shizuku.isPreV11()
                    && Shizuku.pingBinder()
                    && Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable error) {
            return false;
        }
    }

    /** Start binding the user service; safe to call repeatedly. */
    public static synchronized void ensureBound(Context context) {
        if (SERVICE.get() != null || binding) {
            return;
        }
        if (!shizukuAuthorized()) {
            lastError = "Shizuku is not authorized for this app";
            return;
        }

        Context app = context.getApplicationContext();
        // Guard first: addBinderReceivedListenerSticky fires synchronously when the
        // binder is already there, so registering before claiming the guard would
        // re-enter this method until the stack overflows.
        binding = true;
        if (!listenerRegistered) {
            listenerRegistered = true;
            Shizuku.addBinderReceivedListenerSticky(() -> {
                // The binder arrived (or was already present): allow one new attempt.
                binding = false;
                ensureBound(app);
            });
        }
        if (SERVICE.get() != null) {
            return;
        }

        CountDownLatch latch = new CountDownLatch(1);
        PENDING.set(latch);

        ServiceConnection connection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                SERVICE.set(IExecService.Stub.asInterface(binder));
                binding = false;
                latch.countDown();
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                SERVICE.set(null);
                binding = false;
            }
        };

        Shizuku.UserServiceArgs args = new Shizuku.UserServiceArgs(
                new ComponentName(app.getPackageName(), ExecUserService.class.getName()))
                .daemon(false)
                .processNameSuffix("exec")
                .debuggable(false)
                .version(1);
        try {
            Shizuku.bindUserService(args, connection);
        } catch (Throwable error) {
            binding = false;
            lastError = "bindUserService failed: " + error;
            latch.countDown();
        }
    }

    /** Wait briefly for a pending binding, then report whether it is usable. */
    public static boolean waitUntilReady(long timeoutMs) {
        CountDownLatch latch = PENDING.get();
        if (SERVICE.get() != null) {
            return true;
        }
        if (latch == null) {
            return false;
        }
        try {
            latch.await(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
        return SERVICE.get() != null;
    }

    public static Result exec(String command, int timeoutMs) throws IOException {
        IExecService service = SERVICE.get();
        if (service == null) {
            throw new IOException("user service not bound"
                    + (lastError.isEmpty() ? "" : " (" + lastError + ")"));
        }
        try {
            String json = service.exec(command, timeoutMs);
            org.json.JSONObject object = new org.json.JSONObject(json);
            return new Result(object.optInt("exitCode", -1),
                    object.optString("stdout", ""), object.optString("stderr", ""));
        } catch (Exception error) {
            throw new IOException("exec over binder failed: " + error, error);
        }
    }

    public static byte[] execBinary(String command, int timeoutMs) throws IOException {
        IExecService service = SERVICE.get();
        if (service == null) {
            throw new IOException("user service not bound");
        }
        try {
            return service.execBinary(command, timeoutMs);
        } catch (Exception error) {
            throw new IOException("binary exec over binder failed: " + error, error);
        }
    }
}
