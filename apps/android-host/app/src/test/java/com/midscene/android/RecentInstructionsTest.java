package com.midscene.android;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * The Run page's "run that again" list.
 *
 * The storage change is the part worth guarding: the list used to be newline-joined,
 * and an instruction is allowed to be several lines, so one instruction used to come
 * back as two rows. The old form is still read, because an upgrade should keep the
 * list it had.
 */
public class RecentInstructionsTest {

    @Test public void aMultiLineInstructionSurvivesTheRoundTrip() {
        String instruction = "Open Settings\nand turn on Wi-Fi";
        List<String> restored = RecentInstructions.decode(
                RecentInstructions.encode(Collections.singletonList(instruction)));
        assertEquals(Collections.singletonList(instruction), restored);
    }

    @Test public void theNewestInstructionComesFirstWithoutRepeats() {
        List<String> recent = RecentInstructions.add(Arrays.asList("second", "first"), "third");
        assertEquals(Arrays.asList("third", "second", "first"), recent);
        assertEquals(Arrays.asList("second", "first"),
                RecentInstructions.add(Arrays.asList("second", "first"), "second"));
    }

    @Test public void theListStopsAtTheCap() {
        List<String> recent = Collections.emptyList();
        for (int index = 0; index < RecentInstructions.MAX + 4; index += 1) {
            recent = RecentInstructions.add(recent, "instruction " + index);
        }
        assertEquals(RecentInstructions.MAX, recent.size());
        assertEquals("instruction " + (RecentInstructions.MAX + 3), recent.get(0));
    }

    @Test public void blanksAreNotRows() {
        assertTrue(RecentInstructions.decode("").isEmpty());
        assertTrue(RecentInstructions.decode(null).isEmpty());
        assertTrue(RecentInstructions.add(Arrays.asList("kept"), "   ").equals(
                Collections.singletonList("kept")));
        assertTrue(RecentInstructions.remove(
                Arrays.asList("kept", "gone"), "gone").equals(Collections.singletonList("kept")));
    }

    @Test public void theOlderNewlineFormIsStillRead() {
        assertEquals(Arrays.asList("second", "first"),
                RecentInstructions.decode("second\nfirst\n"));
    }

    @Test public void aHandEditedValueDoesNotThrow() {
        // Someone editing the preference by hand should get the rows that still parse,
        // not a crash on the Run page.
        assertEquals(Arrays.asList("[not json", "second"),
                RecentInstructions.decode("[not json\nsecond"));
    }
}
