package com.midscene.localagent;

/** Process-lifetime latch: only reopening the Host allows execution again. */
public final class EmergencyStop {
    static final Object START_LOCK = new Object();
    private static volatile boolean requested;

    private EmergencyStop() {}

    public static boolean isRequested() { return requested; }

    public static void request() {
        synchronized (START_LOCK) {
            if (requested) return;
            requested = true;
        }
        // Independent of the run worker, main looper, and remote Binder response.
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(2500); } catch (InterruptedException ignored) {}
            closeHost();
        }, "midscene-emergency-watchdog");
        watchdog.start();
        new Thread(() -> {
            ProcessTree.killChildren();
            try {
                ShizukuExecBridge.destroyForEmergencyStop();
            } finally {
                closeHost();
            }
        }, "midscene-emergency-stop").start();
    }

    private static void closeHost() {
        ProcessTree.killChildren();
        android.os.Process.killProcess(android.os.Process.myPid());
    }
}
