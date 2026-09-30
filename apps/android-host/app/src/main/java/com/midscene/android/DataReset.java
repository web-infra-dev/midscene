package com.midscene.android;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

import java.io.File;

/**
 * Put the runtime back to "just installed".
 *
 * Everything the first-run guide puts in place is removed: the shell pairing, the model
 * credentials, the extracted agent runtime, the run history and the device-side helpers
 * staged by provisioning. The app is then a fresh install again and the guide can be
 * walked from the top.
 *
 * The pairing *is* a file: this app's adb key lives in `files/adb-home`, and the device
 * records the pairing against that key. Deleting the directory therefore drops the
 * connection as well — and the app's own adb server, which is what holds the loopback
 * connection open, is killed first.
 *
 * Best effort by design: a reset that stops halfway (an unreachable shell channel, a
 * locked file) still has to leave the app in a usable state, so failures are logged and
 * the deletions continue.
 */
public final class DataReset {

    private static final String TAG = "MidsceneReset";

    /** Long enough for a round trip over the shell channel, short enough to not hang. */
    private static final int SHELL_TIMEOUT_MS = 20_000;

    private DataReset() {
    }

    /** Files under `files/` that only ever exist because something was set up. */
    private static final String[] GENERATED_FILES = {
            // Model credentials the settings screen writes.
            "model.env",
            // Scripts the user (or the self-check) saved.
            "config.yaml",
            "self-check.yaml",
            "prompt-run.yaml",
            // Provisioning receipts: their absence is what makes Provision run again.
            "runtime-ready",
            "profileInstalled",
    };

    /** Directories under `files/` that hold generated state. */
    private static final String[] GENERATED_DIRS = {
            "agent",           // the extracted Node runtime + agent bundle
            "adb-home",        // the adb key this app paired with, and its known hosts
            "run",             // service log and per-run logs/reports
            "runs",            // the run history index
            "midscene_run",    // results and reports written by the agent
    };

    /**
     * Wipe the runtime. Blocking (it talks to a shell and deletes megabytes): call it off
     * the main thread, then recreate the console to land on the first-run guide.
     */
    public static void run(Context context) {
        Context app = context.getApplicationContext();

        removeDeviceHelpers(app);
        killAdbServer(app);
        removeFiles(app);
        removePreferences(app);

        // The service owns the foreground notification, the wake lock and the adb
        // server; without this the notification outlives the state it describes.
        try {
            app.stopService(new Intent(app, AgentService.class));
        } catch (RuntimeException error) {
            Log.w(TAG, "could not stop the agent service", error);
        }
    }

    /**
     * Delete what provisioning put on the device, while a shell channel still exists.
     * yadb lives in /data/local/tmp, which SELinux does not let the app write itself.
     */
    private static void removeDeviceHelpers(Context app) {
        String command = "rm -f " + Provisioner.YADB_TARGET
                + "; rm -rf " + RuntimePayloads.CHANNEL_ROOT;
        try {
            ActiveExec.exec(app, command, SHELL_TIMEOUT_MS);
        } catch (Exception error) {
            Log.w(TAG, "could not remove the on-device helpers", error);
        }
    }

    private static void killAdbServer(Context app) {
        try {
            LocalAdbBackend.killServer(app);
        } catch (Exception error) {
            Log.w(TAG, "could not stop the adb server", error);
        }
    }

    private static void removeFiles(Context app) {
        for (String name : GENERATED_DIRS) {
            delete(new File(app.getFilesDir(), name));
        }
        for (String name : GENERATED_FILES) {
            delete(new File(app.getFilesDir(), name));
        }
        // The copy of yadb staged for the shell channel lives on the shared volume.
        File external = app.getExternalFilesDir(null);
        if (external != null) {
            delete(external);
        }
    }

    private static void removePreferences(Context app) {
        // `midscene-ui` holds the first-run flag, the theme and the last instruction;
        // `midscene-adb` holds the remembered adb serial and the paired flag.
        for (String name : new String[]{"midscene-ui", "midscene-adb"}) {
            try {
                app.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear().commit();
            } catch (RuntimeException error) {
                Log.w(TAG, "could not clear " + name, error);
            }
        }
    }

    private static void delete(File file) {
        if (!file.exists()) {
            return;
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    delete(child);
                }
            }
        }
        if (!file.delete()) {
            Log.w(TAG, "could not delete " + file.getAbsolutePath());
        }
    }
}
