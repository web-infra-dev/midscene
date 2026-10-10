package com.midscene.android;

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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;


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

    /**
     * The lookup started at 开始配对 is one long round, not several short ones: the
     * pairing service only exists while that dialog is on screen, so the listener has to
     * still be up when the user gets there.
     */
    private static final long WARM_PAIRING_TIMEOUT_MS = 20_000;
    private static final long WARM_PAIRING_WAIT_MS = 12_000;
    /** How many ports one pairing may be attempted at before the failure is reported. */
    private static final int PAIRING_ATTEMPTS = 3;
    private static final String CHANNEL_ID = "midscene-pairing";
    private static final int NOTIFICATION_ID = 4021;

    public static final String ACTION_CODE = "com.midscene.android.PAIRING_CODE";
    public static final String ACTION_START = "com.midscene.android.PAIRING_START";
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
        warmPairingPort(context);
        // The first pairing command starts this daemon; doing it now keeps that cost
        // outside the few seconds this app is allowed to run for after the code arrives.
        LocalAdbBackend.warmServer(context);
        keepAwake(context);
    }

    /** Set by {@link #requestCode}, read when the service builds its notification. */
    private static volatile String pendingPort = "";

    /** The pairing ports found while the user was reading the code off the screen. */
    private static volatile List<AdbPortCandidates.Answer> warmPairingAnswers = new ArrayList<>();

    private static volatile Thread warmPairingLookup;

    /**
     * Look for the pairing port while the user reads the code and types it.
     *
     * The pairing service is advertised by the dialog, and a lookup started only after
     * the code arrives has to start mDNS from cold — which is what made the first
     * attempt fail (and look like nothing happened) while a second one, with everything
     * warm, went through.
     */
    private static void warmPairingPort(Context context) {
        Thread running = warmPairingLookup;
        if (running != null && running.isAlive()) {
            // One lookup at a time: NsdManager refuses a second discovery of the same
            // type, and refusing it here would waste the answer already on its way.
            return;
        }
        warmPairingAnswers = new ArrayList<>();
        Context app = context.getApplicationContext();
        Thread lookup = new Thread(
                () -> warmPairingAnswers =
                        AdbMdns.awaitOnce(app, AdbMdns.TYPE_PAIRING, WARM_PAIRING_TIMEOUT_MS),
                "adb-pairing-port");
        warmPairingLookup = lookup;
        lookup.start();
    }

    /**
     * The pairing targets to try: this session's warm answers first, then a fresh look.
     *
     * The warm lookup is spent once it has been read, so a retry that follows a failure
     * looks again from scratch — by then mDNS is warm, which is exactly why the second
     * manual attempt used to work. The fresh look is not skipped when the warm one found
     * something: reopening that dialog re-advertises the service on a new port, and the
     * warm answer can be the previous session's.
     */
    private static List<String> pairingCandidates(Context context) {
        Thread running = warmPairingLookup;
        if (running != null && running.isAlive()) {
            Log.i(TAG, "waiting for the pairing-port lookup started at 开始配对");
            try {
                running.join(WARM_PAIRING_WAIT_MS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }
        List<AdbPortCandidates.Answer> warm = warmPairingAnswers;
        warmPairingAnswers = new ArrayList<>();
        warmPairingLookup = null;
        if (!warm.isEmpty()) {
            Log.i(TAG, "pairing ports from the lookup started at 开始配对: " + describe(warm));
        }
        List<AdbPortCandidates.Answer> answers = new ArrayList<>(warm);
        // Nothing was found while the user was typing — usually because the lookup began
        // before that dialog existed. Look now, when it is certainly up. This is the step
        // whose absence made the first attempt fail and the second one work.
        answers.addAll(AdbMdns.collect(context, AdbMdns.TYPE_PAIRING));
        List<String> targets = AdbPortCandidates.order(answers, Collections.emptyList(),
                Collections.emptyList());
        Log.i(TAG, "pairing candidates: " + targets);
        return targets;
    }

    private static String describe(List<AdbPortCandidates.Answer> answers) {
        List<String> described = new ArrayList<>();
        for (AdbPortCandidates.Answer answer : answers) {
            described.add(AdbPortCandidates.describe(answer));
        }
        return described.toString();
    }

    /** The notification the foreground service shows while it waits for the code. */
    static Notification buildCodeRequest(Context context) {
        return buildCodeRequest(context, null);
    }

    /**
     * The same notification, carrying what went wrong last time.
     *
     * A failed attempt has to stay on screen *and* keep its field: the answer is
     * usually "type it again", and the field it was typed into is right there.
     *
     * The field changes meaning once the pairing has been accepted by the device. From
     * then on the pairing code is spent and the part that moves is the port, so the same
     * field asks for the port the user is reading off the wireless-debugging screen and
     * the action connects instead of pairing. Reporting a port that moved as "pairing
     * failed", with instructions to re-enter the code, was the wrong repair at the wrong
     * step: it sent the user back through a flow that cannot change the port.
     */
    static Notification buildCodeRequest(Context context, String error) {
        // The service posts this straight to startForeground, and a notification on a
        // channel that does not exist yet is dropped rather than shown.
        ensureChannel(context, context.getSystemService(NotificationManager.class));
        boolean portMode = LocalAdbBackend.isPaired(context);
        Intent intent = new Intent(context, Receiver.class)
                .setAction(ACTION_CODE)
                .putExtra(EXTRA_PORT, pendingPort);

        android.app.RemoteInput input = new android.app.RemoteInput.Builder(EXTRA_CODE)
                .setLabel(context.getString(portMode
                        ? R.string.pairing_port_label
                        : R.string.pairing_code_label))
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
                context.getString(portMode
                        ? R.string.pairing_connect_action
                        : R.string.pairing_pair_action), pending)
                .addRemoteInput(input)
                .setAllowGeneratedReplies(false)
                .build();

        String instructions = context.getString(portMode
                ? R.string.pairing_request_big_text_paired
                : R.string.pairing_request_big_text);
        return new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentTitle(context.getString(error != null
                        ? R.string.pairing_failed
                        : (portMode
                                ? R.string.pairing_connect_title
                                : R.string.pairing_request_title)))
                .setContentText(error != null
                        ? error
                        : context.getString(portMode
                                ? R.string.pairing_request_text_paired
                                : R.string.pairing_request_text))
                .setStyle(new Notification.BigTextStyle().bigText(
                        // The reason comes first: the instructions are only useful once
                        // the user knows why the last attempt did not take.
                        error == null ? instructions : error + "\n\n" + instructions))
                .setContentIntent(open)
                .addAction(action)
                .setOnlyAlertOnce(true)
                .build();
    }

    private static void ensureChannel(Context context, NotificationManager manager) {
        if (manager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, context.getString(R.string.pairing_channel),
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(context.getString(R.string.pairing_channel_desc));
        manager.createNotificationChannel(channel);
    }

    private static void report(Context context, String text, boolean done) {
        lastResult = text;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        ensureChannel(context, manager);
        Notification.Builder builder = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentTitle(context.getString(
                        done ? R.string.pairing_paired : R.string.pairing_failed))
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

    /**
     * A failure of the notification flow, reported where the user is looking.
     *
     * The field stays live and the notification stays on screen (the service detaches
     * it instead of removing it), so trying again is another tap on Pair rather than
     * another trip through 开始配对 — and a failure is never invisible, which is how
     * "the first try did nothing" was experienced.
     */
    private static void failPairing(Context context, String text) {
        lastResult = text;
        if (!AgentService.showPairingError(context, text)) {
            report(context, text, false);
        }
        AgentService.start(context, AgentService.ACTION_PAIRING_DONE, null);
    }

    /**
     * Whether the key this app already has opens a shell on the device.
     *
     * Used after a pairing that failed: the device is the authority on whether it
     * paired, and "our command's answer never arrived" looks the same as "the device
     * refused" from here.
     */
    private static boolean connectWithExistingKey(Context context) {
        try {
            List<String> candidates = LocalAdbBackend.connectCandidates(context, null);
            if (candidates.isEmpty()) {
                return false;
            }
            LocalAdbBackend.connectFirstWorking(context, candidates);
            return true;
        } catch (Exception error) {
            Log.w(TAG, "the key does not work yet: " + error.getMessage());
            return false;
        }
    }

    /**
     * Bring the console forward: pairing is done, and what follows — provisioning, or
     * the Reconnect this screen offers — lives in the app, not in the shade.
     */
    private static void openConsole(Context context) {
        try {
            context.startActivity(new Intent(context, ConsoleActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
        } catch (Exception error) {
            Log.w(TAG, "could not bring the console forward", error);
        }
    }

    /** Runs the pairing; called on the receiver's worker, never on the main thread. */
    static void pairAndConnect(Context context, String code, String manualPort) {
        try {
            List<String> targets = manualPort == null || manualPort.trim().isEmpty()
                    // The ports found while the code was being typed, then a fresh look
                    // now that the dialog is certainly up.
                    ? pairingCandidates(context)
                    : Collections.singletonList(LocalAdbBackend.normalize(manualPort));
            if (targets.isEmpty()) {
                failPairing(context, context.getString(R.string.pairing_port_missing));
                return;
            }
            // pair() confirms with the device and records the outcome; it throws with
            // the device's own words when the pairing was refused.
            try {
                pairOverCandidates(context, targets, code);
            } catch (IOException pairingFailed) {
                if (!connectWithExistingKey(context)) {
                    throw pairingFailed;
                }
                // The key already opens a shell: the device recorded the pairing even
                // though this app never heard so — which is what a first attempt that
                // "did nothing" leaves behind when the system froze us mid-command.
                Log.i(TAG, "pairing reported " + pairingFailed.getMessage()
                        + ", but the device already accepts our key");
                report(context, context.getString(R.string.pairing_connected,
                        LocalAdbBackend.serial(context)), true);
                AgentService.start(context, AgentService.ACTION_PROVISION, null);
                openConsole(context);
                return;
            }

            // Paired. What follows is a different problem from pairing: the port this
            // phone listens on, which the ROM re-picks whenever wireless debugging
            // restarts and which mDNS can still be answering out of its cache with the
            // value from before. Every candidate is tried, and each one is verified by
            // the uid-2000 probe inside connect(), so a stale answer costs one refused
            // connection instead of the whole pairing.
            List<String> connectTargets = LocalAdbBackend.connectCandidates(context, null);
            if (connectTargets.isEmpty()) {
                // Paired is real progress and worth saying so: the remaining step needs
                // the wireless-debugging screen, not another pairing code.
                report(context, context.getString(R.string.pairing_paired_no_port), true);
                AgentService.start(context, AgentService.ACTION_PAIRING_DONE, null);
                openConsole(context);
                return;
            }
            try {
                LocalAdbBackend.connectFirstWorking(context, connectTargets);
            } catch (IOException connectFailed) {
                // Not "pairing failed": the device accepted the code. Saying otherwise
                // sends the user back to re-type a code that cannot fix a moved port.
                failPairing(context, context.getString(R.string.pairing_connect_failed,
                        connectFailed.getMessage()));
                return;
            }
            report(context, context.getString(R.string.pairing_connected,
                    LocalAdbBackend.serial(context)), true);
            AgentService.start(context, AgentService.ACTION_PROVISION, null);
            // Pairing happens from the notification shade; the run that the user just
            // authorised does not.
            openConsole(context);
        } catch (Exception error) {
            Log.w(TAG, "pairing failed", error);
            failPairing(context, error.getMessage());
        }
    }

    /**
     * Pair at the first candidate port that is actually there.
     *
     * The first attempt is the one that loses races: the pairing port is re-advertised
     * with a new number every time that dialog is (re)opened, so mDNS can hand back the
     * previous session's port, and the adb server this app starts has to be up before a
     * command can talk to it. A code the device never accepted is still valid, so a
     * retry at another port is free — and it is what a user does by hand when the first
     * tap does nothing, which is exactly the behaviour this replaces.
     *
     * A port that answers and refuses the code is a different failure: the code is
     * wrong, every other port would refuse it the same way, and trying again would only
     * spend the device's pairing attempts.
     */
    private static void pairOverCandidates(Context context, List<String> candidates, String code)
            throws IOException {
        IOException firstFailure = null;
        int attempts = 0;
        for (String candidate : candidates) {
            if (attempts >= PAIRING_ATTEMPTS) {
                break;
            }
            attempts += 1;
            try {
                LocalAdbBackend.pair(context, candidate, code);
                if (attempts > 1) {
                    Log.i(TAG, "paired at " + candidate + " after " + candidates.get(0)
                            + " did not answer");
                }
                return;
            } catch (IOException failure) {
                Log.w(TAG, "pairing at " + candidate + " failed: " + failure.getMessage());
                if (firstFailure == null) {
                    firstFailure = failure;
                }
                if (!AdbPairingInput.portDidNotAnswer(failure.getMessage())) {
                    throw failure;
                }
            }
        }
        throw firstFailure != null
                ? firstFailure
                : new IOException(context.getString(R.string.pairing_port_missing));
    }

    /**
     * Get connected, discovering the port when it is not remembered.
     *
     * The old version only used the stored serial and reported the channel state as
     * a success either way — so a device that had never connected showed "Paired",
     * and the one action that could have fixed it did nothing at all.
     *
     * The stored serial is a hint, not an address: it is the port of a previous session,
     * and wireless debugging hands out a new one whenever it restarts. So it is tried
     * together with the ports mDNS is advertising now, and when none of them answers it
     * is forgotten — otherwise every later Reconnect would dial the same dead number.
     */
    static void reconnect(Context context) {
        keepAwake(context);
        try {
            if (!LocalAdbBackend.isPaired(context) && !LocalAdbBackend.hasKey(context)) {
                fail(context, context.getString(R.string.pairing_not_paired));
                return;
            }
            if (LocalAdbBackend.reachable(context)) {
                ActiveExec.Status status = ActiveExec.probe(context);
                report(context, status.detail, status.ready);
                AgentService.start(context, AgentService.ACTION_PAIRING_DONE, null);
                return;
            }
            List<String> candidates = LocalAdbBackend.connectCandidates(context, null);
            if (candidates.isEmpty()) {
                fail(context, context.getString(R.string.pairing_no_port));
                return;
            }
            try {
                LocalAdbBackend.connectFirstWorking(context, candidates);
            } catch (IOException failed) {
                LocalAdbBackend.forgetSerial(context);
                throw failed;
            }
            ActiveExec.Status status = ActiveExec.probe(context);
            report(context, status.detail, status.ready);
        } catch (Exception error) {
            Log.w(TAG, "reconnect failed", error);
            report(context, context.getString(R.string.pairing_reconnect_failed,
                    error.getMessage()), false);
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
     *
     * The typed port is tried first and the discovered ones after it: when the user has
     * just read a port off the wireless-debugging screen, that reading is the freshest
     * thing this app has.
     */
    static void connectTo(Context context, String target) {
        keepAwake(context);
        try {
            if (target == null || target.trim().isEmpty()) {
                fail(context, context.getString(R.string.pairing_enter_port));
                return;
            }
            LocalAdbBackend.connectFirstWorking(context,
                    LocalAdbBackend.connectCandidates(context, target.trim()));
            ActiveExec.Status status = ActiveExec.probe(context);
            report(context, status.detail, status.ready);
        } catch (Exception error) {
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
                    if (typed == null || typed.trim().isEmpty()) {
                        failPairing(app, app.getString(R.string.pairing_no_code));
                        return;
                    }
                    // "935436" is the normal form. The port is printed on the same
                    // dialog, so accepting "935436 44221" as well gives the user a way
                    // through when this phone's mDNS will not answer. A port on its own
                    // is the third form, and it belongs to the step after pairing: the
                    // pairing survived, the port moved, and the user is reading the new
                    // one off the screen.
                    AdbPairingInput.Entry entry = AdbPairingInput.parse(typed);
                    if (entry == null) {
                        failPairing(app, app.getString(R.string.pairing_bad_code));
                        return;
                    }
                    if (entry.portOnly()) {
                        if (!LocalAdbBackend.isPaired(app) && !LocalAdbBackend.hasKey(app)) {
                            failPairing(app, app.getString(R.string.pairing_need_code));
                            return;
                        }
                        connectTo(app, entry.port());
                        return;
                    }
                    String manualPort = entry.port() == null
                            ? intent.getStringExtra(EXTRA_PORT) : entry.port();
                    pairAndConnect(app, entry.code(), manualPort);
                } catch (Exception error) {
                    // Nothing may escape this thread: an uncaught exception here takes
                    // the whole app down while the user is looking at the notification
                    // shade, which is exactly the report this path exists to give.
                    Log.w(TAG, "pairing worker failed", error);
                    failPairing(app, app.getString(R.string.pairing_failed_detail,
                            String.valueOf(error.getMessage())));
                } finally {
                    pending.finish();
                }
            }, "adb-pairing").start();
        }
    }
}
