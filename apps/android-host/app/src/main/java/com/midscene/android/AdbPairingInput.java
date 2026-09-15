package com.midscene.android;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What the user typed into the pairing notification.
 *
 * Two different things can be typed there, and they belong to two different steps:
 *
 *   "676879"          the pairing code          → pair
 *   "676879 35591"    code plus the pairing port → pair at that port
 *   "45215"           a port on its own          → connect (pairing is already done)
 *
 * The last form exists because the port is the half that moves: when wireless debugging
 * restarts, the pairing survives and only the port changes, and the port is printed on
 * the screen the user is looking at. Before this, a pairing that had already succeeded
 * could only be followed by another pairing attempt, which is the wrong repair for a
 * stale port — the notification now asks for the port and connects with it.
 *
 * A port is at most five digits, so "six digits" and "a port" can never be confused.
 * Pure on purpose: the parsing and the error-text classification are unit-tested.
 */
final class AdbPairingInput {

    private static final Pattern CODE = Pattern.compile("^\\s*(\\d{6})\\s*[:\\s]?\\s*(\\d{1,5})?\\s*$");
    private static final Pattern PORT = Pattern.compile("^\\s*(\\d{1,5})\\s*$");

    /** One parsed entry: exactly one of the two modes is set. */
    static final class Entry {

        private final String code;
        private final String port;

        private Entry(String code, String port) {
            this.code = code;
            this.port = port;
        }

        /** The six-digit code, or null when the entry was a bare port. */
        String code() {
            return code;
        }

        /** The port that followed the code, or the bare port. */
        String port() {
            return port;
        }

        /** Whether the entry was a port and nothing else, i.e. a connect request. */
        boolean portOnly() {
            return code == null;
        }
    }

    private AdbPairingInput() {
    }

    /** Parse the typed text, or null when it is neither a code nor a port. */
    static Entry parse(String typed) {
        if (typed == null) {
            return null;
        }
        String value = typed.trim();
        if (value.isEmpty()) {
            return null;
        }
        Matcher code = CODE.matcher(value);
        if (code.matches()) {
            return new Entry(code.group(1), code.group(2));
        }
        Matcher port = PORT.matcher(value);
        if (port.matches()) {
            return new Entry(null, port.group(1));
        }
        return null;
    }

    /**
     * Whether a failed {@code adb pair} says "that port is not there" rather than
     * "that code is wrong".
     *
     * The distinction decides whether the next candidate port is worth trying: a wrong
     * code fails the same way at every port and would only burn the device's pairing
     * attempts, while a port that has been re-rolled fails with the client's own words
     * about the connection.
     */
    static boolean portDidNotAnswer(String message) {
        if (message == null) {
            return false;
        }
        String text = message.toLowerCase(Locale.ROOT);
        return text.contains("connection refused")
                || text.contains("failed to connect")
                || text.contains("cannot connect")
                || text.contains("connection reset")
                || text.contains("failed to resolve")
                || text.contains("timed out");
    }
}
