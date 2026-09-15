package com.midscene.android;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Find the ports wireless debugging is listening on.
 *
 * adbd picks both ports at random every time the toggle is flipped, and no
 * setting or system property exposes them to an ordinary app. They are
 * advertised over mDNS instead, which is what adb itself uses to list devices:
 *
 *   _adb-tls-pairing._tcp  the port that is open while the pairing dialog is up
 *   _adb-tls-connect._tcp  the port every later connection goes to
 *
 * One discovery window is collected rather than one answer, because mDNS is a cache as
 * well as a lookup: a browse started now is answered out of mdnsd's records first, so
 * the port this phone had a minute ago can arrive before — or instead of — the port it
 * has now, and stopping at the first answer is how a rotated port turned into
 * "adb connect failed: ... Connection refused". Every answer is kept, a goodbye (or the
 * same service name on a new port) removes the record it replaces, and the caller tries
 * the survivors in the order {@link AdbPortCandidates} defines.
 *
 * The window closes {@link #SETTLE_MS} after the last answer, so a lookup that is
 * answered immediately still costs well under a second.
 *
 * NsdManager is the only channel for this: the bundled adb client was built without
 * mDNS support ({@code adb mdns services} answers "unknown host service 'mdns:services'"
 * on-device, measured on a OnePlus 13T / ColorOS 16), and neither ROM exposes
 * {@code service.adb.tls.port} to an ordinary app — it is absent on that device.
 */
final class AdbMdns {

    static final String TYPE_PAIRING = "_adb-tls-pairing._tcp";
    static final String TYPE_CONNECT = "_adb-tls-connect._tcp";

    private static final String TAG = "MidsceneAdbMdns";

    /** How long one window stays open, and how long it keeps listening after an answer. */
    private static final long WINDOW_MS = 2_500;
    private static final long SETTLE_MS = 700;

    /**
     * How many windows one lookup may spend, and the pause between them.
     *
     * Rounds are paced rather than immediate: NsdManager refuses a discovery of a type
     * whose previous one has not finished tearing down, and that teardown is
     * asynchronous — trying again in the same millisecond as the previous round ends
     * just fails the same way. A round that found one of this phone's own answers ends
     * the lookup.
     */
    private static final int LOOKUP_ROUNDS = 2;
    private static final long LOOKUP_PAUSE_MS = 1_200;

    private AdbMdns() {
    }

    /**
     * Every answer for one service type, in arrival order.
     *
     * Blocking, for callers already on a worker. Answers from hosts that are not this
     * phone are included and marked as such: the caller decides what to do with them.
     */
    static List<AdbPortCandidates.Answer> collect(Context context, String serviceType) {
        List<AdbPortCandidates.Answer> answers = new ArrayList<>();
        for (int round = 0; round < LOOKUP_ROUNDS; round += 1) {
            if (round > 0) {
                try {
                    Thread.sleep(LOOKUP_PAUSE_MS);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return answers;
                }
            }
            answers.addAll(awaitOnce(context, serviceType, WINDOW_MS));
            if (hasLocal(answers) || Thread.currentThread().isInterrupted()) {
                break;
            }
        }
        return answers;
    }

    /**
     * One discovery, kept open for {@code windowMs} — and for {@link #SETTLE_MS} after
     * the last answer, whichever comes first once something has answered.
     *
     * Separate from {@link #collect} because a caller sometimes wants a single long
     * round rather than several short ones: while the user walks to the pairing dialog,
     * the listener has to still be up when they get there.
     */
    static List<AdbPortCandidates.Answer> awaitOnce(Context context, String serviceType,
                                                    long windowMs) {
        final List<AdbPortCandidates.Answer> found = new ArrayList<>();
        final Object lock = new Object();
        final boolean[] finished = new boolean[]{false};
        discover(context, serviceType, windowMs, new Listener() {
            @Override
            public void onAnswer(AdbPortCandidates.Answer answer) {
                synchronized (lock) {
                    found.add(answer);
                    lock.notifyAll();
                }
            }

            @Override
            public void onLost(int port) {
                synchronized (lock) {
                    for (int index = found.size() - 1; index >= 0; index -= 1) {
                        if (found.get(index).port == port) {
                            found.remove(index);
                        }
                    }
                    lock.notifyAll();
                }
            }

            @Override
            public void onFinished(String reason) {
                synchronized (lock) {
                    if (reason != null) {
                        Log.w(TAG, serviceType + ": " + reason);
                    }
                    finished[0] = true;
                    lock.notifyAll();
                }
            }
        });
        synchronized (lock) {
            long deadline = System.currentTimeMillis() + windowMs + 3_000;
            while (!finished[0] && System.currentTimeMillis() < deadline) {
                try {
                    lock.wait(500);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            return new ArrayList<>(found);
        }
    }

    /** The targets to try for one service type, best first. */
    static List<String> candidateTargets(Context context, String serviceType,
                                         List<String> preferred, List<String> fallback) {
        return AdbPortCandidates.order(collect(context, serviceType), preferred, fallback);
    }

    private static boolean hasLocal(List<AdbPortCandidates.Answer> answers) {
        for (AdbPortCandidates.Answer answer : answers) {
            if (answer.local) {
                return true;
            }
        }
        return false;
    }

    private interface Listener {
        void onAnswer(AdbPortCandidates.Answer answer);

        /** A port this window had already reported is gone: drop it. */
        void onLost(int port);

        void onFinished(String reason);
    }

    private static void discover(Context context, String serviceType, long windowMs,
                                 Listener listener) {
        NsdManager manager = context.getSystemService(NsdManager.class);
        if (manager == null) {
            listener.onFinished("this device has no network service discovery");
            return;
        }
        Handler handler = new Handler(Looper.getMainLooper());
        final boolean[] settled = new boolean[]{false};
        final NsdManager.DiscoveryListener[] discovery = new NsdManager.DiscoveryListener[1];
        /** Ports still believed to be live, and the service name each one belongs to. */
        final Map<Integer, AdbPortCandidates.Answer> live = new LinkedHashMap<>();
        final Map<String, Integer> portByName = new HashMap<>();
        final Runnable[] finish = new Runnable[1];
        final Runnable[] settle = new Runnable[1];

        finish[0] = () -> {
            synchronized (settled) {
                if (settled[0]) {
                    return;
                }
                settled[0] = true;
            }
            if (settle[0] != null) {
                handler.removeCallbacks(settle[0]);
            }
            stop(manager, discovery[0]);
            boolean anything;
            synchronized (live) {
                anything = !live.isEmpty();
            }
            // A connect port is advertised by every device on the network that has
            // wireless debugging on, so "nothing answered at all" is the failure worth
            // naming — a foreign answer is the caller's business.
            listener.onFinished(anything
                    ? null
                    : "no " + serviceType + " service answered within "
                            + (windowMs / 1000) + "s");
        };
        settle[0] = () -> finish[0].run();
        handler.postDelayed(finish[0], windowMs);

        discovery[0] = new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String type) {
                Log.i(TAG, "discovering " + type);
            }

            @Override
            public void onServiceFound(NsdServiceInfo info) {
                manager.resolveService(info, new NsdManager.ResolveListener() {
                    @Override
                    public void onResolveFailed(NsdServiceInfo failed, int errorCode) {
                        // Another service of the same type can still answer, so this
                        // is not the end of the search.
                        Log.w(TAG, "resolve failed for " + failed.getServiceName()
                                + " (" + errorCode + ")");
                    }

                    @Override
                    public void onServiceResolved(NsdServiceInfo resolved) {
                        String host = resolved.getHost() == null
                                ? null : resolved.getHost().getHostAddress();
                        String name = resolved.getServiceName();
                        int port = resolved.getPort();
                        boolean local = isThisDevice(host);
                        AdbPortCandidates.Answer answer = local
                                ? AdbPortCandidates.local(name, host, port)
                                : AdbPortCandidates.foreign(name, host, port);
                        List<Integer> dropped = new ArrayList<>();
                        synchronized (live) {
                            Integer previous = portByName.put(name, port);
                            if (previous != null && previous != port) {
                                // The same service on a new port: the responder moved it,
                                // and the record it left behind is exactly the stale
                                // answer this class exists to filter out.
                                live.remove(previous);
                                dropped.add(previous);
                            }
                            AdbPortCandidates.Answer existing = live.get(port);
                            if (existing == null || (!existing.local && local)) {
                                live.put(port, answer);
                            }
                        }
                        // Logged because a stale answer here is invisible otherwise: the
                        // port changes every time the dialog is reopened.
                        Log.i(TAG, "resolved " + AdbPortCandidates.describe(answer));
                        for (int gone : dropped) {
                            listener.onLost(gone);
                        }
                        listener.onAnswer(answer);
                        removeAndStop();
                    }
                });
            }

            @Override
            public void onServiceLost(NsdServiceInfo info) {
                int gone;
                synchronized (live) {
                    // Only the service name survives into a lost record; the port is
                    // whatever this window last saw under that name.
                    Integer port = portByName.remove(info.getServiceName());
                    if (port == null) {
                        return;
                    }
                    live.remove(port);
                    gone = port;
                }
                Log.i(TAG, "lost " + info.getServiceName() + " on " + gone);
                listener.onLost(gone);
            }

            @Override
            public void onDiscoveryStopped(String type) {
            }

            @Override
            public void onStartDiscoveryFailed(String type, int errorCode) {
                synchronized (settled) {
                    if (settled[0]) {
                        return;
                    }
                    settled[0] = true;
                }
                handler.removeCallbacks(finish[0]);
                listener.onFinished("discovery could not start (" + errorCode + ")");
            }

            @Override
            public void onStopDiscoveryFailed(String type, int errorCode) {
                Log.w(TAG, "stop failed for " + type + " (" + errorCode + ")");
            }

            /**
             * Keep the window open a moment past the last answer: a browse hands back
             * its cached records before the live ones, and the live one is the point.
             */
            private void removeAndStop() {
                handler.removeCallbacks(settle[0]);
                handler.postDelayed(settle[0], SETTLE_MS);
            }
        };

        try {
            manager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discovery[0]);
        } catch (RuntimeException error) {
            // "already active" is the documented failure when a previous discovery
            // of the same type has not been torn down yet.
            handler.removeCallbacks(finish[0]);
            listener.onFinished("discovery is already running: " + error.getMessage());
        }
    }

    private static void stop(NsdManager manager, NsdManager.DiscoveryListener listener) {
        if (listener == null) {
            return;
        }
        try {
            manager.stopServiceDiscovery(listener);
        } catch (RuntimeException error) {
            Log.w(TAG, "could not stop discovery: " + error);
        }
    }

    /**
     * Whether this address belongs to the phone we are running on.
     *
     * The connect port is advertised for as long as wireless debugging is on, by
     * every device on the network that has it on. Without this check the app can
     * resolve a neighbour's port, and because the connection is made over loopback
     * that turns into a failure that looks like the feature being broken.
     *
     * An address we cannot enumerate is not thrown away — it is marked as somebody
     * else's and tried last, because the record can also be our own on an interface
     * this enumeration missed.
     */
    private static boolean isThisDevice(String host) {
        if (host == null) {
            return false;
        }
        try {
            java.util.Enumeration<java.net.NetworkInterface> interfaces =
                    java.net.NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                java.net.NetworkInterface iface = interfaces.nextElement();
                java.util.Enumeration<java.net.InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    if (host.equals(addresses.nextElement().getHostAddress())) {
                        return true;
                    }
                }
            }
        } catch (Exception error) {
            Log.w(TAG, "could not enumerate local addresses: " + error);
        }
        return false;
    }
}
