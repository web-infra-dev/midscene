package com.midscene.localagent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import java.io.IOException;

/**
 * Pairing, done the only way this screen allows.
 *
 * Android's wireless-debugging screen removes the pairing dialog as soon as it
 * pauses and cancels the pairing server with it, so a "type the code here" form
 * inside this app cannot work: opening the form closes the very port the code
 * belongs to. (Measured on a OnePlus 13T / ColorOS 16: the pairing port stopped
 * listening the moment this app came to the front.)
 *
 * What does work is staying on that screen and typing into the notification
 * shade, which is an overlay rather than a new activity — the same reason
 * Shizuku and every other app in this space asks for the code from a
 * notification.
 */
public final class AdbPairing {

    private static final String TAG = "MidsceneAdbPairing";
    private static final String CHANNEL_ID = "midscene-pairing";
    private static final int NOTIFICATION_ID = 4021;

    public static final String ACTION_CODE = "com.midscene.localagent.PAIRING_CODE";
    public static final String ACTION_START = "com.midscene.localagent.PAIRING_START";
    public static final String EXTRA_CODE = "code";
    public static final String EXTRA_PORT = "port";
    /** Result of the last attempt, for the diagnostics card to show. */
    public static volatile String lastResult = "";

    private AdbPairing() {
    }

    /**
     * Keep this process out of the ROM's freezer for the length of a pairing.
     *
     * Everything here runs with the app in the background, and a frozen process
     * never delivers the mDNS callbacks — nor even the timeout that is supposed to
     * give up on them. The foreground service is the only thing that stops the
     * freeze; without it the pairing hangs at "discovering" indefinitely.
     */
    private static void keepAwake(Context context) {
        try {
            AgentService.start(context, AgentService.ACTION_PAIRING, null);
        } catch (RuntimeException error) {
            // Android 12+ refuses a background foreground-service start unless the
            // app is exempt from battery optimisation. Carrying on is better than
            // failing the pairing outright: on a ROM that does not freeze apps, the
            // attempt still works.
            Log.w(TAG, "could not hold the process up: " + error);
        }
    }

    /**
     * Ask for the code without taking the screen away from the pairing dialog.
     *
     * Starting our own activity to collect the code is not an option — that pauses
     * Settings and cancels the pairing server with it — so the field lives in a
     * notification. It is the *foreground service's* notification, not a second one:
     * two notifications from one app get grouped, and a grouped notification is
     * rendered collapsed with its actions unreachable on at least one ROM.
     *
     * The service is what posts it; this only asks for it.
     */
    public static void requestCode(Context context, String pairingPort) {
        pendingPort = pairingPort == null ? "" : pairingPort;
        keepAwake(context);
    }

    /** Set by {@link #requestCode}, read when the service builds its notification. */
    private static volatile String pendingPort = "";

    /** The notification the foreground service shows while it waits for the code. */
    static Notification buildCodeRequest(Context context) {
        // The service posts this straight to startForeground, and a notification on a
        // channel that does not exist yet is dropped rather than shown.
        ensureChannel(context.getSystemService(NotificationManager.class));
        Intent intent = new Intent(context, Receiver.class)
                .setAction(ACTION_CODE)
                .putExtra(EXTRA_PORT, pendingPort);

        android.app.RemoteInput input = new android.app.RemoteInput.Builder(EXTRA_CODE)
                .setLabel("6-digit pairing code")
                .build();
        // RemoteInput needs an explicitly mutable PendingIntent from API 31 on;
        // below that the flag does not exist and UPDATE_CURRENT is already mutable.
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        PendingIntent pending = PendingIntent.getBroadcast(context, 0, intent, flags);
        PendingIntent open = PendingIntent.getActivity(
                context, 0,
                new Intent(context, ConsoleActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Action action = new Notification.Action.Builder(
                android.graphics.drawable.Icon.createWithResource(
                        context, android.R.drawable.ic_menu_send),
                "Pair", pending)
                .addRemoteInput(input)
                .setAllowGeneratedReplies(false)
                .build();

        return new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentTitle("Enter the pairing code")
                .setContentText("Keep the wireless-debugging screen open and type the six "
                        + "digits it shows.")
                .setStyle(new Notification.BigTextStyle().bigText(
                        "Keep the wireless-debugging screen open. Type the six digits shown "
                                + "under \"Pair device with pairing code\" into the field below "
                                + "and tap Pair. If nothing happens, type the six digits and the "
                                + "port from that same dialog, separated by a space."))
                .setContentIntent(open)
                .addAction(action)
                .setOnlyAlertOnce(true)
                .build();
    }

    private static void ensureChannel(NotificationManager manager) {
        if (manager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Pairing", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Receives the wireless-debugging pairing code");
        manager.createNotificationChannel(channel);
    }

    private static void report(Context context, String text, boolean done) {
        lastResult = text;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        ensureChannel(manager);
        Notification.Builder builder = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentTitle(done ? "Paired" : "Pairing failed")
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setOnlyAlertOnce(true)
                .setAutoCancel(true);
        // No setOngoing: an outcome the user cannot dismiss is worse than no
        // notification at all when it is a failure they have to act on.
        manager.notify(NOTIFICATION_ID, builder.build());
    }

    /** Report a failure and stop holding the process up for it. */
    private static void fail(Context context, String text) {
        report(context, text, false);
        AgentService.start(context, AgentService.ACTION_PAIRING_DONE, null);
    }

    /** Runs the pairing; called on the receiver's worker, never on the main thread. */
    static void pairAndConnect(Context context, String code, String manualPort) {
        try {
            String target = manualPort;
            if (target == null || target.trim().isEmpty()) {
                target = AdbMdns.resolveBlocking(context, AdbMdns.TYPE_PAIRING, 6_000);
            }
            if (target == null) {
                fail(context, "Could not find the pairing port. Open the pairing dialog "
                        + "and try again.");
                return;
            }
            // pair() confirms with the device and records the outcome; it throws with
            // the device's own words when the pairing was refused.
            LocalAdbBackend.pair(context, target, code);

            String connectTarget = AdbMdns.resolveBlocking(context, AdbMdns.TYPE_CONNECT, 6_000);
            if (connectTarget == null) {
                // Paired is real progress and worth saying so: the remaining step needs
                // the wireless-debugging screen, not another pairing code.
                report(context, "Paired. The connection port is not advertised yet — open "
                        + "wireless debugging, then tap Reconnect.", true);
                AgentService.start(context, AgentService.ACTION_PAIRING_DONE, null);
                return;
            }
            LocalAdbBackend.connect(context, connectTarget);
            report(context, "Connected to " + LocalAdbBackend.serial(context)
                    + ". Midscene can drive this phone now.", true);
            AgentService.start(context, AgentService.ACTION_PROVISION, null);
        } catch (IOException error) {
            Log.w(TAG, "pairing failed", error);
            fail(context, error.getMessage());
        }
    }

    /**
     * Get connected, discovering the port when it is not remembered.
     *
     * The old version only used the stored serial and reported the channel state as
     * a success either way — so a device that had never connected showed "Paired",
     * and the one action that could have fixed it did nothing at all.
     */
    static void reconnect(Context context) {
        keepAwake(context);
        try {
            if (!LocalAdbBackend.isPaired(context) && !LocalAdbBackend.hasKey(context)) {
                fail(context, "Not paired with this device yet. Use \"Pair this phone\" "
                        + "first.");
                return;
            }
            String target = LocalAdbBackend.serial(context);
            if (target.isEmpty()) {
                // Right after pairing, and after wireless debugging has been toggled,
                // the port is new and nothing has remembered it yet.
                target = AdbMdns.resolveBlocking(context, AdbMdns.TYPE_CONNECT, 6_000);
                if (target == null) {
                    fail(context, "Paired, but no wireless-debugging port answered. Turn "
                            + "wireless debugging on, then tap Reconnect.");
                    return;
                }
            }
            LocalAdbBackend.connect(context, target);
            ActiveExec.Status status = ActiveExec.probe(context);
            report(context, status.detail, status.ready);
        } catch (IOException error) {
            Log.w(TAG, "reconnect failed", error);
            report(context, "Reconnect failed: " + error.getMessage(), false);
        }
        // Reconnecting is the whole job; nothing follows it that needs the process up.
        AgentService.start(context, AgentService.ACTION_PAIRING_DONE, null);
    }

    /**
     * Connect to a port the user typed, for the path that needs no pairing code.
     *
     * A device whose adbd already listens — an "ADB over network" developer switch,
     * or 5555 after {@code adb tcpip 5555} — only has to be connected to. The device
     * then asks the user to approve this app's key, which replaces the pairing code
     * entirely.
     */
    static void connectTo(Context context, String target) {
        keepAwake(context);
        try {
            if (target == null || target.trim().isEmpty()) {
                fail(context, "Enter the port the phone listens on, for example 5555.");
                return;
            }
            LocalAdbBackend.connect(context, target.trim());
            ActiveExec.Status status = ActiveExec.probe(context);
            report(context, status.detail, status.ready);
        } catch (IOException error) {
            Log.w(TAG, "manual connect failed", error);
            report(context, error.getMessage(), false);
        }
        AgentService.start(context, AgentService.ACTION_PAIRING_DONE, null);
    }

    /** Receives the code from the notification shade and finishes the pairing. */
    public static final class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) {
                return;
            }
            String action = intent.getAction();
            Context app = context.getApplicationContext();
            ActiveExec.install(app);
            // A broadcast can wake a frozen process for as long as it takes to run;
            // this is what keeps it awake for the work that follows.
            keepAwake(app);
            PendingResult pending = goAsync();
            new Thread(() -> {
                try {
                    if (ACTION_START.equals(action)) {
                        reconnect(app);
                        return;
                    }
                    android.os.Bundle results = android.app.RemoteInput.getResultsFromIntent(intent);
                    String typed = results == null ? null : results.getString(EXTRA_CODE);
                    if (typed == null) {
                        fail(app, "No pairing code arrived. Try again.");
                        return;
                    }
                    // "935436" is the normal form. The port is printed on the same
                    // dialog, so accepting "935436 44221" as well gives the user a way
                    // through when this phone's mDNS will not answer.
                    java.util.regex.Matcher parsed = java.util.regex.Pattern
                            .compile("(\\d{6})\\s*[:\\s]?\\s*(\\d{1,5})?")
                            .matcher(typed.trim());
                    if (!parsed.find()) {
                        fail(app, "That was not a six-digit code. Try again.");
                        return;
                    }
                    String manualPort = parsed.group(2) == null
                            ? intent.getStringExtra(EXTRA_PORT) : parsed.group(2);
                    pairAndConnect(app, parsed.group(1), manualPort);
                } finally {
                    pending.finish();
                }
            }, "adb-pairing").start();
        }
    }
}
