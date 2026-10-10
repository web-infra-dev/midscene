package com.midscene.android;

import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class RunStoreTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();

    @Test
    public void pruneRemovesOrphanResultsWithoutDiscardingReferencedRun() throws Exception {
        File filesDir = temp.newFolder("files");
        RunStore store = new RunStore(filesDir);
        File results = new File(filesDir, "midscene_run/results");
        assertTrue(results.mkdirs());
        File referenced = new File(results, "kept.json");
        File orphan = new File(results, "orphan.json");
        Files.write(referenced.toPath(), "kept".getBytes(StandardCharsets.UTF_8));
        Files.write(orphan.toPath(), "orphan".getBytes(StandardCharsets.UTF_8));

        store.append(new JSONObject()
                .put("id", "run-1")
                .put("resultFile", referenced.getAbsolutePath()));

        assertEquals(1, store.list().size());
        assertTrue(referenced.isFile());
        assertFalse(orphan.exists());
    }

    @Test
    public void appendKeepsOnlyMostRecentRuns() throws Exception {
        RunStore store = new RunStore(temp.newFolder("files"));
        for (int index = 0; index <= RunStore.MAX_RUNS; index++) {
            store.append(new JSONObject().put("id", "run-" + index));
        }

        assertEquals(RunStore.MAX_RUNS, store.list().size());
        assertFalse(new File(new File(temp.getRoot(), "files/runs"), "run-0.json").exists());
    }
}
