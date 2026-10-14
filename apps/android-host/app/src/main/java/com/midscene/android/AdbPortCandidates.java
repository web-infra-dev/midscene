package com.midscene.android;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * The order in which adb targets are tried.
 *
 * Why a list at all: wireless debugging picks a new port every time it restarts, and
 * mDNS is not a live view of that port — a discovery is answered out of mdnsd's cache
 * first, so the port the phone had a minute ago can be the first, or the only, answer.
 * A device that changed its port therefore used to fail with
 *
 *   adb connect failed: failed to connect to '127.0.0.1:40501': Connection refused
 *
 * on a phone whose own settings screen said 45215. Pairing had already succeeded; the
 * one thing that was wrong was trusting a single answer. Trying every answer costs a
 * refused TCP connect per dead port (milliseconds), so the port is treated as a
 * candidate to be verified rather than as an address to be dialled once.
 *
 * Ordering, best first:
 *
 *   1. what the user typed — they are reading it off the phone's screen right now;
 *   2. this phone's own answers, newest arrival first — the browse cache delivers the
 *      old record before the fresh one, so the later answer is the more trustworthy;
 *   3. the port remembered from the last session — a hint that outlives its port;
 *   4. answers from hosts that are not this phone, last: they are usually a neighbour's
 *      device on the same network, but they also cover a record of our own whose
 *      address this app could not enumerate (a second interface, a VPN).
 *
 * Pure on purpose: no Android types, so the ordering rules are unit-tested directly.
 */
final class AdbPortCandidates {

    /** One mDNS answer, in the order the discovery delivered it. */
    static final class Answer {

        final String serviceName;
        /** The advertised address; null when the browser did not report one. */
        final String host;
        final int port;
        /**
         * Whether {@code host} is one of this phone's own addresses. A record we could
         * not match is kept, but it is a guess and is tried after everything else.
         */
        final boolean local;

        private Answer(String serviceName, String host, int port, boolean local) {
            this.serviceName = serviceName;
            this.host = host;
            this.port = port;
            this.local = local;
        }
    }

    static Answer local(String serviceName, String host, int port) {
        return new Answer(serviceName, host, port, true);
    }

    static Answer foreign(String serviceName, String host, int port) {
        return new Answer(serviceName, host, port, false);
    }

    private AdbPortCandidates() {
    }

    /**
     * The targets to try, in order and without duplicates.
     *
     * @param answers   mDNS answers in arrival order; may be empty
     * @param preferred targets the user supplied, tried first in the given order
     * @param fallback  remembered targets, tried after this phone's own answers
     */
    static List<String> order(List<Answer> answers, List<String> preferred,
                              List<String> fallback) {
        LinkedHashSet<String> targets = new LinkedHashSet<>();
        addAll(targets, preferred);
        addAll(targets, ports(answers, true));
        addAll(targets, fallback);
        addAll(targets, ports(answers, false));
        return new ArrayList<>(targets);
    }

    /** The loopback target for a port: this app always talks to its own adbd. */
    static String target(int port) {
        return "127.0.0.1:" + port;
    }

    /** A stable, loggable rendering of an answer, used by the diagnostics log lines. */
    static String describe(Answer answer) {
        return (answer.serviceName == null ? "service" : answer.serviceName)
                + " at " + (answer.host == null ? "?" : answer.host) + ":" + answer.port
                + (answer.local ? "" : " (not this device)");
    }

    /** Newest first: the last answer is the one least likely to come from the cache. */
    private static List<String> ports(List<Answer> answers, boolean local) {
        List<String> targets = new ArrayList<>();
        for (int index = answers.size() - 1; index >= 0; index -= 1) {
            Answer answer = answers.get(index);
            if (answer.local == local && answer.port > 0 && answer.port <= 65_535) {
                targets.add(target(answer.port));
            }
        }
        return targets;
    }

    private static void addAll(LinkedHashSet<String> targets, List<String> candidates) {
        if (candidates == null) {
            return;
        }
        for (String candidate : candidates) {
            if (candidate != null && !candidate.trim().isEmpty()) {
                targets.add(candidate);
            }
        }
    }
}
