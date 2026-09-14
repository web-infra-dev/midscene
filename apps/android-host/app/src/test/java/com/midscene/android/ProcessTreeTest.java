package com.midscene.android;

import org.junit.Test;
import java.util.List;
import java.util.Map;
import static org.junit.Assert.*;

public class ProcessTreeTest {
    @Test public void parsesNamesWithSpacesAndParentheses() {
        assertEquals(123, ProcessTree.parentPid("42 (node (worker)) S 123 0 0"));
        assertThrows(IllegalArgumentException.class, () -> ProcessTree.parentPid("bad"));
    }

    @Test public void onlyIncludesOwnDescendantsDeepestFirst() {
        Map<Integer, Integer> parents = Map.of(10, 1, 11, 10, 12, 11, 13, 10, 20, 1, 21, 20);
        List<Integer> children = ProcessTree.descendants(10, parents);
        assertEquals(3, children.size());
        assertTrue(children.containsAll(List.of(11, 12, 13)));
        assertTrue(children.indexOf(12) < children.indexOf(11));
        assertFalse(children.contains(10));
        assertFalse(children.contains(1));
        assertFalse(children.contains(20));
        assertFalse(children.contains(21));
    }

    @Test public void emptyTreeAndCyclesCannotKillTheRoot() {
        assertTrue(ProcessTree.descendants(10, Map.of()).isEmpty());
        assertEquals(List.of(11), ProcessTree.descendants(10, Map.of(10, 11, 11, 10)));
    }
}
