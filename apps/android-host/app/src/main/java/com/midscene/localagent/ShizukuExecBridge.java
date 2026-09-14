package com.midscene.localagent;

import android.content.ComponentName;
import android.content.Context;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.util.Log;

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
 * Binding is not one-shot. The app starts before the user has answered Shizuku's
 * authorization prompt, and a bind attempted at that moment fails; nothing used to
 * retry it, which left the user service permanently unbound while Shizuku's own
 * list showed the app as authorized. Three things guard against that now:
 *
 * - {@link #requestPermission} binds as soon as Shizuku reports the grant, so the
 *   normal flow needs no extra tap;
 * - {@link #probeBinding} actively asks the service for its uid instead of
 *   assuming a completed bind means a working one;
 * - {@link #ensureBound} retries a bind that has been in flight far longer than
 *   Shizuku needs, instead of blocking every later attempt forever.
 */
public final class ShizukuExecBridge {

    private static final String TAG = "MidsceneShizuku";

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

    /** What the diagnostics screen reports, and what the run gate branches on. */
    public static final class BindingState {
        public final boolean ready;
        public final boolean binder;
        public final boolean authorized;
        public final Integer uid;
        public final String reason;
        /**
         * Shizuku's own status for this user-service record, from
         * {@code peekUserService}: 0 means "already running". Reported verbatim
         * because the API does not document the other values, and a number we
         * cannot name is still worth showing next to "not started".
         *
         * A negative value is this class's own sentinel, not Shizuku's:
         * -1 the bound service did not answer {@code uid()};
         * -90 no application context; -91 no Shizuku binder;
         * -92 the peek call itself failed.
         */
        public final int serviceStatus;
        /**
         * Set only when a bound service failed to answer. Distinct from the bind
         * error because the two faults have different causes: "never started" vs
         * "started and then went away".
         */
        public final String serviceFailure;

        BindingState(boolean ready, boolean binder, boolean authorized, Integer uid,
                     String reason, int serviceStatus, String serviceFailure) {
            this.ready = ready;
            this.binder = binder;
            this.authorized = authorized;
            this.uid = uid;
            this.reason = reason;
            this.serviceStatus = serviceStatus;
            this.serviceFailure = serviceFailure;
        }
    }

    /** Result of Shizuku's authorization prompt. */
    public interface PermissionCallback {
        void onResult(boolean granted);
    }

    /** uid of adb shell, and of the user service when Shizuku runs as shell. */
    private static final int SHELL_UID = 2000;

    /**
     * A user service that has not come up by now is not going to: Shizuku starts
     * it before {@code onServiceConnected} fires. Waiting longer only makes
     * provisioning look hung, so a stale attempt is abandoned and retried.
     */
    /**
     * How long a caller waits for a bind that is already in flight.
     *
     * Measured on the Android 14 emulator: Shizuku needs about 10 s to hand over
     * the binder on a cold start. The wait returns as soon as the service
     * connects, so the ceiling costs nothing in the normal case; it only bounds
     * how long a failure takes to report.
     */
    private static final long BIND_WAIT_TIMEOUT_MS = 30_000;

    private static final AtomicReference<IExecService> SERVICE = new AtomicReference<>();
    private static final AtomicReference<CountDownLatch> PENDING = new AtomicReference<>();
    private static volatile boolean binding;
    private static volatile long bindingStartedAt;
    private static volatile String lastError = "";
    private static volatile boolean listenerRegistered;
    /** Kept so a retry from a non-Activity caller still has something to bind with. */
    private static volatile Context appContext;
    /** Cached descriptor: Shizuku treats each new instance as a new connection. */
    private static volatile Shizuku.UserServiceArgs ARGS;

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
            Log.w(TAG, "authorization check threw", error);
            return false;
        }
    }

    /** Raw inputs to the authorization decision, for the diagnostic log. */
    private static String isPreV11() {
        try {
            return String.valueOf(Shizuku.isPreV11());
        } catch (Throwable error) {
            return "threw " + error.getClass().getSimpleName();
        }
    }

    private static String selfPermission() {
        try {
            return String.valueOf(Shizuku.checkSelfPermission());
        } catch (Throwable error) {
            return "threw " + error.getClass().getSimpleName() + ": " + error.getMessage();
        }
    }

    public static boolean binderAlive() {
        try {
            return Shizuku.pingBinder();
        } catch (Throwable error) {
            return false;
        }
    }

    /**
     * Ask Shizuku for the permission, then bind the moment it is granted.
     *
     * The second half is the point of this method: a grant that nobody reacts to
     * is useless until the process restarts.
     */
    public static void requestPermission(int requestCode, PermissionCallback callback) {
        Shizuku.OnRequestPermissionResultListener listener = (code, grantResult) -> {
            boolean granted = grantResult == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                // Asynchronous; the caller's status probe reports how it went.
                dropBinding();
                ensureBound(appContext, true);
            }
            if (callback != null) {
                callback.onResult(granted);
            }
        };

        try {
            Shizuku.addRequestPermissionResultListener(listener);
            Shizuku.requestPermission(requestCode);
        } catch (Throwable error) {
            lastError = "requestPermission failed: " + error;
            try {
                Shizuku.removeRequestPermissionResultListener(listener);
            } catch (Throwable ignored) {
                // Nothing to remove when registration itself failed.
            }
            if (callback != null) {
                callback.onResult(false);
            }
        }
    }

    /**
     * Forget the current binding so the next {@link #ensureBound} is a real
     * attempt. Used when the permission is re-granted and when a bound service
     * could not answer.
     */
    private static synchronized void dropBinding() {
        SERVICE.set(null);
        PENDING.set(null);
        // `binding` is intentionally left alone: it guards the attempt that is
        // still in flight. Clearing it here let concurrent callers each start a
        // bind, and each one spawned another user-service process.
    }

    /**
     * The user-service descriptor: the single definition of how Shizuku is asked
     * to run our service.
     *
     * The process name is suffixed uniquely rather than with a generic word, so a
     * Shizuku log line about a stuck record names this app and nothing else.
     *
     * Note: `UserServiceArgs.use32BitAppProcess` exists in the bytecode but is
     * private in API 13.1.5, so the 32-bit app_process workaround some ROMs need
     * is not reachable without reflection. If a device turns out to need it, that
     * is the place to start digging.
     */
    private static Shizuku.UserServiceArgs userServiceArgs(Context app) {
        // One instance for the process: Shizuku keys its connection list by these
        // args, and handing it a fresh object on every peek registered a duplicate
        // connection each time (the "user service connected" log repeated endlessly).
        Shizuku.UserServiceArgs cached = ARGS;
        if (cached == null) {
            cached = new Shizuku.UserServiceArgs(
                    new ComponentName(app.getPackageName(), ExecUserService.class.getName()))
                    .daemon(false)
                    .tag("user-service")
                    .processNameSuffix("midscene")
                    .debuggable(false)
                    .version(3);
            ARGS = cached;
        }
        return cached;
    }

    /** Start binding the user service; safe to call repeatedly. */
    public static void ensureBound(Context context) {
        ensureBound(context, false);
    }

    /**
     * @param force retry even while another attempt is in flight. Only for the
     *              paths that know the current attempt is stale: a fresh permission
     *              grant, or a bound service that went away.
     */
    public static synchronized void ensureBound(Context context, boolean force) {
        if (EmergencyStop.isRequested()) return;
        if (context != null) {
            appContext = context.getApplicationContext();
        }
        Context app = appContext;
        if (app == null) {
            return;
        }

        if (SERVICE.get() != null) {
            return;
        }
        // A bind that never calls back leaves `binding` set forever; treat it as
        // stale rather than letting it suppress every later attempt. The window
        // also bounds the wait a caller can rely on, see BIND_WAIT_TIMEOUT_MS.
        if (!force && binding
                && System.currentTimeMillis() - bindingStartedAt < BIND_WAIT_TIMEOUT_MS) {
            return;
        }
        if (!shizukuAuthorized()) {
            lastError = "Shizuku is not authorized for this app yet";
            Log.w(TAG, "bind skipped: preV11=" + isPreV11() + " binder=" + binderAlive()
                    + " selfPermission=" + selfPermission());
            return;
        }

        try {
            if (Shizuku.getUid() != SHELL_UID) {
                lastError = "Start Shizuku as shell (ADB), not root; Midscene only accepts uid 2000";
                return;
            }
        } catch (RuntimeException error) {
            lastError = "Could not verify Shizuku uid: " + error;
            return;
        }

        // The binder is already present here. A sticky listener would re-enter
        // this method and submit the same cold bind twice.
        binding = true;
        bindingStartedAt = System.currentTimeMillis();
        lastError = "";
        if (!listenerRegistered) {
            listenerRegistered = true;
            Shizuku.addBinderReceivedListener(() -> {
                // A new server binder arrived: allow one new attempt.
                binding = false;
                ensureBound(app);
            });
        }
        if (SERVICE.get() != null) {
            binding = false;
            return;
        }

        CountDownLatch latch = new CountDownLatch(1);
        PENDING.set(latch);

        ServiceConnection connection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                boolean first = SERVICE.getAndSet(IExecService.Stub.asInterface(binder)) == null;
                if (first) {
                    Log.i(TAG, "user service connected: " + name.flattenToShortString());
                }
                binding = false;
                latch.countDown();
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                Log.w(TAG, "user service disconnected: " + name.flattenToShortString());
                SERVICE.set(null);
                binding = false;
                lastError = "the Shizuku user service disconnected";
            }

            @Override
            public void onBindingDied(ComponentName name) {
                Log.w(TAG, "user service binding died: " + name.flattenToShortString());
                SERVICE.set(null);
                binding = false;
                lastError = "the user service binding died";
            }

            @Override
            public void onNullBinding(ComponentName name) {
                Log.w(TAG, "user service returned a null binding: " + name.flattenToShortString());
                SERVICE.set(null);
                binding = false;
                lastError = "Shizuku returned a null binding for the user service";
                latch.countDown();
            }
        };

        Shizuku.UserServiceArgs args = userServiceArgs(app);
        String component = app.getPackageName() + "/" + ExecUserService.class.getName();
        try {
            Log.i(TAG, "bindUserService " + component + " tag=user-service version=3"
                    + " appUser=" + (android.os.Process.myUid() / 100000));
            Shizuku.bindUserService(args, connection);
        } catch (Throwable error) {
            binding = false;
            lastError = "bindUserService failed: " + error;
            Log.w(TAG, "bindUserService threw", error);
            latch.countDown();
            return;
        }

        // Deliberately no wait here. Callers include Activity/Service onCreate, so
        // blocking would freeze the UI for as long as Shizuku takes (measured ~10 s
        // on a cold start). The bind is asynchronous; whoever needs the result waits
        // for it off the main thread through waitUntilReady().
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

    /**
     * Ask the service for its uid, binding first if needed.
     *
     * This is what separates "Shizuku is running and the app is authorized" from
     * "a shell-uid process is actually reachable" — only the second makes a run
     * possible, and only this call proves it.
     */
    public static BindingState probeBinding(Context context, long timeoutMs) {
        Log.i(TAG, "probe: binder=" + binderAlive() + " preV11=" + isPreV11()
                + " selfPermission=" + selfPermission());
        ensureBound(context);

        boolean binder = binderAlive();
        boolean authorized = shizukuAuthorized();

        if (!isReady()) {
            waitUntilReady(timeoutMs > 0 ? timeoutMs : BIND_WAIT_TIMEOUT_MS);
        }

        IExecService service = SERVICE.get();
        if (service == null) {
            if (lastError.isEmpty() && android.os.Process.myUid() / 100000 != 0) {
                lastError = "UserService did not connect for Android user "
                        + (android.os.Process.myUid() / 100000)
                        + ". On multi-user ROMs, check that Midscene and Shizuku are also "
                        + "installed for user 0 (see scripts/check-multi-user.sh). "
                        + "This is a compatibility hint, not a confirmed cause; inspect "
                        + "ShizukuServiceStarter logs before changing the installation scope.";
            }
            return new BindingState(false, binder, authorized, null, lastError,
                    peekServiceStatus(context), null);
        }

        int uid;
        try {
            uid = service.uid();
        } catch (Exception error) {
            // A bound service that cannot answer is not usable. Drop it so the
            // next attempt is a real one rather than a cached failure.
            String detail = error.getClass().getSimpleName()
                    + (error.getMessage() == null ? "" : ": " + error.getMessage());
            Log.w(TAG, "the bound user service did not answer uid(): " + detail, error);
            dropBinding();
            return new BindingState(false, binder, authorized, null, lastError, -1,
                    "The user service process answered the bind and then went away before "
                            + "it could report its uid (" + detail + "). It starts and dies.");
        }

        if (uid != SHELL_UID) {
            lastError = "the user service runs as uid " + uid + ", not shell(" + SHELL_UID + ")";
            return new BindingState(false, binder, authorized, uid, lastError,
                    peekServiceStatus(context), null);
        }

        lastError = "";
        return new BindingState(true, binder, authorized, uid, null, 0, null);
    }

    /**
     * Ask Shizuku whether it already has this service, without starting one.
     *
     * `peekUserService` is the synchronous sibling of `bindUserService` and it
     * answers immediately, so a diagnosis no longer costs a 30-second wait.
     * Negative values are our own: the call itself failed.
     */
    public static int peekServiceStatus(Context context) {
        Context app = context != null ? context.getApplicationContext() : appContext;
        if (app == null) {
            return -90;
        }
        if (!binderAlive()) {
            return -91;
        }
        try {
            int status = Shizuku.peekUserService(userServiceArgs(app), null);
            Log.i(TAG, "peekUserService status=" + status);
            return status;
        } catch (Throwable error) {
            Log.w(TAG, "peekUserService failed", error);
            return -92;
        }
    }

    public static Result exec(String command, int timeoutMs) throws IOException {
        requireExecutionAllowed();
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
        requireExecutionAllowed();
        IExecService service = SERVICE.get();
        if (service == null) {
            throw new IOException("user service not bound");
        }
        try {
            return readPipe(service.execBinary(command, timeoutMs));
        } catch (Exception error) {
            throw new IOException("binary exec over binder failed: " + error, error);
        }
    }
    public static void installYadb(byte[] bytes) throws IOException {
        requireExecutionAllowed();
        IExecService service = SERVICE.get();
        if (service == null) {
            throw new IOException("user service not bound");
        }
        try {
            service.installYadb(bytes);
        } catch (Exception error) {
            throw new IOException("yadb transfer over binder failed", error);
        }
    }

    public static byte[] readChannelFile(String path) throws IOException {
        requireExecutionAllowed();
        IExecService service = SERVICE.get();
        if (service == null) {
            throw new IOException("user service not bound");
        }
        try {
            return readPipe(service.readChannelFile(path));
        } catch (Exception error) {
            throw new IOException("channel read over binder failed: " + error, error);
        }
    }

    static void destroyForEmergencyStop() {
        IExecService service = SERVICE.getAndSet(null);
        if (service != null) {
            try {
                service.destroy();
            } catch (Exception error) {
                Log.i(TAG, "UserService destroy requested; binder may close before replying", error);
            }
        }
    }

    private static void requireExecutionAllowed() throws IOException {
        if (EmergencyStop.isRequested()) {
            throw new IOException("Host is force-stopping");
        }
    }

    private static byte[] readPipe(ParcelFileDescriptor descriptor) throws IOException {
        if (descriptor == null) {
            throw new IOException("user service returned no payload descriptor");
        }
        try (ParcelFileDescriptor.AutoCloseInputStream input =
                     new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
            byte[] bytes = RuntimePayloads.readBounded(input, RuntimePayloads.MAX_CHANNEL_BYTES);
            descriptor.checkError();
            return bytes;
        }
    }
}
