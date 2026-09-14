package com.midscene.localagent;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

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
 * One-shot on purpose: both callers (pair now, connect now) want a single answer
 * and then a released listener, and leaving a discovery running keeps the
 * multicast lock held for as long as the app lives.
 */
public final class AdbMdns {

    public static final String TYPE_PAIRING = "_adb-tls-pairing._tcp";
    public static final String TYPE_CONNECT = "_adb-tls-connect._tcp";

    private static final String TAG = "MidsceneAdbMdns";

    public interface Listener {
        void onResolved(String host, int port);

        void onFailed(String reason);
    }

    private AdbMdns() {
    }

    public static void discoverOnce(Context context, String serviceType, long timeoutMs,
                                    Listener listener) {
        NsdManager manager = context.getSystemService(NsdManager.class);
        if (manager == null) {
            listener.onFailed("this device has no network service discovery");
            return;
        }
        Handler handler = new Handler(Looper.getMainLooper());
        final boolean[] settled = new boolean[]{false};
        final NsdManager.DiscoveryListener[] discovery = new NsdManager.DiscoveryListener[1];
        /** First answer from anywhere, used only if this device never answers. */
        final int[] foreignPort = new int[]{-1};

        Runnable finish = () -> {
            synchronized (settled) {
                if (settled[0]) {
                    return;
                }
                settled[0] = true;
            }
            stop(manager, discovery[0]);
            // A connect port is advertised by every device on the network that has
            // wireless debugging on, so "nothing local answered" is worth reporting
            // even when somebody else's phone did.
            if (foreignPort[0] > 0) {
                Log.w(TAG, "only a foreign " + serviceType + " answered");
                listener.onResolved(null, foreignPort[0]);
                return;
            }
            listener.onFailed("no " + serviceType + " service answered within "
                    + (timeoutMs / 1000) + "s");
        };
        handler.postDelayed(finish, timeoutMs);

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
                        if (!isThisDevice(host)) {
                            // Somebody else's phone. Keep looking: settling here is
                            // how a correct pairing turns into "connected to the
                            // wrong port" on a shared network. Short grace period
                            // rather than the full timeout, so an address we simply
                            // failed to enumerate locally still resolves.
                            synchronized (foreignPort) {
                                if (foreignPort[0] < 0) {
                                    foreignPort[0] = resolved.getPort();
                                    handler.postDelayed(finish, 1_500);
                                }
                            }
                            return;
                        }
                        synchronized (settled) {
                            if (settled[0]) {
                                return;
                            }
                            settled[0] = true;
                        }
                        handler.removeCallbacks(finish);
                        stop(manager, discovery[0]);
                        listener.onResolved(host, resolved.getPort());
                    }
                });
            }

            @Override
            public void onServiceLost(NsdServiceInfo info) {
                // The answer is one port; losing one candidate changes nothing.
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
                handler.removeCallbacks(finish);
                listener.onFailed("discovery could not start (" + errorCode + ")");
            }

            @Override
            public void onStopDiscoveryFailed(String type, int errorCode) {
                Log.w(TAG, "stop failed for " + type + " (" + errorCode + ")");
            }
        };

        try {
            manager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discovery[0]);
        } catch (RuntimeException error) {
            // "already active" is the documented failure when a previous discovery
            // of the same type has not been torn down yet.
            handler.removeCallbacks(finish);
            listener.onFailed("discovery is already running: " + error.getMessage());
        }
    }

    /**
     * Blocking form of {@link #discoverOnce}, for callers already on a worker.
     *
     * Resolves to {@code 127.0.0.1:<port>}: the device is reachable over its own
     * loopback, so going out to the LAN address it advertises would be a detour.
     * Returns null when nothing answers, and waits a little past the discovery
     * timeout so a resolution that lands late is still used.
     */
    public static String resolveBlocking(Context context, String serviceType, long timeoutMs) {
        for (int attempt = 0; attempt < 2; attempt += 1) {
            final String[] found = new String[1];
            final Object lock = new Object();
            discoverOnce(context, serviceType, timeoutMs, new Listener() {
                @Override
                public void onResolved(String host, int port) {
                    synchronized (lock) {
                        found[0] = "127.0.0.1:" + port;
                        lock.notifyAll();
                    }
                }

                @Override
                public void onFailed(String reason) {
                    synchronized (lock) {
                        Log.w(TAG, serviceType + ": " + reason);
                        lock.notifyAll();
                    }
                }
            });
            synchronized (lock) {
                long deadline = System.currentTimeMillis() + timeoutMs + 2_000;
                while (found[0] == null && System.currentTimeMillis() < deadline) {
                    try {
                        lock.wait(500);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        return null;
                    }
                }
            }
            if (found[0] != null) {
                return found[0];
            }
        }
        return null;
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
