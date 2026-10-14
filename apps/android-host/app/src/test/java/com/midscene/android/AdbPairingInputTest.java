package com.midscene.android;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * What the pairing notification accepts, and how a failed pairing is classified.
 *
 * The port form ("45215") exists because the port is the half that moves: pairing
 * survives a wireless-debugging restart, the port does not. The classification decides
 * whether another candidate port is worth trying — a wrong code fails identically at
 * every port, while a re-rolled port fails with the client's own words about the
 * connection.
 */
public class AdbPairingInputTest {

    @Test public void sixDigitsIsACode() {
        AdbPairingInput.Entry entry = AdbPairingInput.parse("676879");
        assertFalse(entry.portOnly());
        assertEquals("676879", entry.code());
        assertNull(entry.port());
    }

    @Test public void aCodeMayCarryItsPortWithASeparator() {
        AdbPairingInput.Entry spaced = AdbPairingInput.parse("676879 35591");
        assertEquals("676879", spaced.code());
        assertEquals("35591", spaced.port());
        assertEquals("35591", AdbPairingInput.parse("676879:35591").port());
        assertEquals("35591", AdbPairingInput.parse("67687935591").port());
        assertEquals("35591", AdbPairingInput.parse("  676879 35591  ").port());
    }

    @Test public void fiveDigitsOrFewerIsAPortOnItsOwn() {
        AdbPairingInput.Entry entry = AdbPairingInput.parse("45215");
        assertTrue(entry.portOnly());
        assertNull(entry.code());
        assertEquals("45215", entry.port());
        assertEquals("5555", AdbPairingInput.parse("5555").port());
    }

    @Test public void anythingElseIsRejectedRatherThanGuessed() {
        assertNull(AdbPairingInput.parse(null));
        assertNull(AdbPairingInput.parse(""));
        assertNull(AdbPairingInput.parse("   "));
        assertNull(AdbPairingInput.parse("abcdef"));
        assertNull(AdbPairingInput.parse("12345abc"));
        assertNull(AdbPairingInput.parse("676879 abc"));
    }

    @Test public void aRefusedConnectionIsAPortProblem() {
        assertTrue(AdbPairingInput.portDidNotAnswer(
                "adb pair failed: failed to connect to '127.0.0.1:40501': Connection refused"));
        assertTrue(AdbPairingInput.portDidNotAnswer("cannot connect to 127.0.0.1:35591"));
        assertFalse(AdbPairingInput.portDidNotAnswer(null));
    }

    @Test public void aRefusedCodeIsNot() {
        // The port answered and the device said no: every other port would say the same,
        // and trying them would only spend the device's pairing attempts.
        assertFalse(AdbPairingInput.portDidNotAnswer(
                "the device rejected the pairing: Failed to pair: wrong password"));
    }
}
