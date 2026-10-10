package com.midscene.android;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * The ordering rules behind "try the ports instead of trusting one".
 *
 * The failure this guards: pairing succeeded, mDNS answered with the port this phone
 * had before wireless debugging restarted, and the whole attempt was reported as a
 * pairing failure on a phone whose own screen showed a different, live port.
 */
public class AdbPortCandidatesTest {

    private static AdbPortCandidates.Answer local(int port) {
        return AdbPortCandidates.local("adb-PHONE-1", "30.2.7.193", port);
    }

    private static AdbPortCandidates.Answer foreign(int port) {
        return AdbPortCandidates.foreign("adb-OTHER-9", "30.2.7.44", port);
    }

    @Test public void newestOwnAnswerComesBeforeTheCachedOne() {
        // Arrival order: the browse cache answers with the port from before the restart
        // (40501), the live record arrives after it (45215).
        List<String> targets = AdbPortCandidates.order(
                Arrays.asList(local(40501), local(45215)),
                Collections.emptyList(), Collections.emptyList());
        assertEquals(Arrays.asList("127.0.0.1:45215", "127.0.0.1:40501"), targets);
    }

    @Test public void typedPortIsTriedFirst() {
        List<String> targets = AdbPortCandidates.order(
                Arrays.asList(local(40501)),
                Arrays.asList("127.0.0.1:45215"),
                Collections.emptyList());
        assertEquals("127.0.0.1:45215", targets.get(0));
    }

    @Test public void rememberedPortComesAfterThisPhonesOwnAnswersAndBeforeForeignOnes() {
        List<String> targets = AdbPortCandidates.order(
                Arrays.asList(foreign(1111), foreign(3333), local(2222)),
                Collections.emptyList(),
                Arrays.asList("127.0.0.1:9000"));
        // Own answer first, then the hint from the last session, then the neighbours'
        // ports — newest of those first.
        assertEquals(Arrays.asList(
                "127.0.0.1:2222",
                "127.0.0.1:9000",
                "127.0.0.1:3333",
                "127.0.0.1:1111"), targets);
    }

    @Test public void duplicatesCollapseAndEmptyInputsAreIgnored() {
        List<String> targets = AdbPortCandidates.order(
                Arrays.asList(local(2222), local(2222)),
                Arrays.asList("", "  ", "127.0.0.1:2222"),
                Arrays.asList((String) null, "127.0.0.1:2222"));
        assertEquals(Collections.singletonList("127.0.0.1:2222"), targets);
    }

    @Test public void noAnswerAtAllYieldsNothingToTry() {
        assertTrue(AdbPortCandidates.order(
                Collections.emptyList(), Collections.emptyList(), Collections.emptyList())
                .isEmpty());
    }

    @Test public void portsOutsideTheTcpRangeAreNotDialled() {
        // NsdManager reports 0 for a record that was never resolved; dialling it would
        // only produce an error that says nothing.
        List<String> targets = AdbPortCandidates.order(
                Arrays.asList(local(0), local(70000), local(45215)),
                Collections.emptyList(), Collections.emptyList());
        assertEquals(Collections.singletonList("127.0.0.1:45215"), targets);
    }

    @Test public void describeNamesEveryFieldForTheLog() {
        assertEquals("adb-PHONE-1 at 30.2.7.193:45215", AdbPortCandidates.describe(local(45215)));
        assertEquals("adb-OTHER-9 at 30.2.7.44:1111 (not this device)",
                AdbPortCandidates.describe(foreign(1111)));
    }
}
