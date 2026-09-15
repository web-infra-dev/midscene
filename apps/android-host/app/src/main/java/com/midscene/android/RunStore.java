package com.midscene.android;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Run history: one JSON record per run plus an append-only index.
 *
 * The store lives in the app's private storage and is written by the service, so
 * history survives the activity being recreated or swiped away.
 */
public class RunStore {

    /** Keep at most this many runs. */
    public static final int MAX_RUNS = 50;
    /** And at most this much disk for reports, logs and results together. */
    public static final long MAX_BYTES = 300L * 1024 * 1024;

    public static final class RunRecord {
        public final String id;
        public final String configName;
        public final long startedAt;
        public final long durationMs;
        public final boolean ok;
        public final int exitCode;
        public final int taskCount;
        public final int failedTasks;
        public final String resultFile;
        public final String reportFile;
        public final String logFile;

        RunRecord(JSONObject json) {
            this.id = json.optString("id");
            this.configName = json.optString("configName");
            this.startedAt = json.optLong("startedAt");
            this.durationMs = json.optLong("durationMs");
            this.ok = json.optBoolean("ok");
            this.exitCode = json.optInt("exitCode", -1);
            this.taskCount = json.optInt("taskCount", 0);
            this.failedTasks = json.optInt("failedTasks", 0);
            this.resultFile = json.optString("resultFile", "");
            this.reportFile = json.optString("reportFile", "");
            this.logFile = json.optString("logFile", "");
        }
    }

    private final File dir;

    public RunStore(File filesDir) {
        this.dir = new File(filesDir, "runs");
        if (!dir.exists() && !dir.mkdirs()) {
            // history is best effort; a missing directory just means an empty list
        }
    }

    public File logFileFor(String id) {
        return new File(dir, id + ".log");
    }

    public synchronized void append(JSONObject record) {
        try {
            writeJson(new File(dir, record.optString("id") + ".json"), record);
            JSONArray index = readIndex();
            index.put(record);
            writeJson(indexFile(), wrap(index));
        } catch (IOException | JSONException error) {
            // History is best effort: bookkeeping must never break a run.
        }
        // Reports embed every screenshot (megabytes each), so the store trims itself
        // after every run instead of waiting for the disk to fill up.
        prune();
    }

    /**
     * Drop the oldest runs until both limits hold, then remove report files nothing
     * points at any more.
     *
     * @return how many runs were removed
     */
    public synchronized int prune() {
        removeOrphanReports();
        List<RunRecord> records = list();
        int removed = 0;
        long total = totalBytes();

        // `list()` returns newest first.
        for (int index = records.size() - 1; index >= 0; index--) {
            boolean tooMany = records.size() - removed > MAX_RUNS;
            if (!tooMany && total <= MAX_BYTES) {
                break;
            }
            RunRecord record = records.get(index);
            total -= sizeOf(record);
            delete(record);
            removed++;
        }

        removeOrphanReports();
        removeEmptyDirs();
        return removed;
    }

    /** Bytes used by this run's artefacts. */
    private long sizeOf(RunRecord record) {
        long size = 0;
        size += length(record.logFile);
        size += length(record.resultFile);
        size += length(record.reportFile);
        size += length(new File(dir, record.id + ".json").getAbsolutePath());
        return size;
    }

    private long length(String path) {
        if (path == null || path.isEmpty()) {
            return 0;
        }
        File file = new File(path);
        return file.isFile() ? file.length() : 0;
    }

    /** Everything the app keeps for runs: index, logs, results and reports. */
    public synchronized long totalBytes() {
        long total = 0;
        total += directoryBytes(dir);
        total += directoryBytes(new File(new File(dir.getParentFile(), "run"), "report"));
        total += directoryBytes(new File(dir.getParentFile(), "midscene_run/results"));
        return total;
    }

    private long directoryBytes(File directory) {
        long total = 0;
        File[] files = directory.listFiles();
        if (files == null) {
            return 0;
        }
        for (File file : files) {
            total += file.isDirectory() ? directoryBytes(file) : file.length();
        }
        return total;
    }

    /** Report files left behind by runs that are no longer in the index. */
    private void removeOrphanReports() {
        java.util.Set<String> referenced = new java.util.HashSet<>();
        for (RunRecord record : list()) {
            if (!record.reportFile.isEmpty()) {
                referenced.add(new File(record.reportFile).getName());
            }
            if (!record.resultFile.isEmpty()) {
                referenced.add(new File(record.resultFile).getName());
            }
            referenced.add(record.id + ".log");
            referenced.add(record.id + ".json");
        }

        removeUnreferencedFiles(new File(new File(dir.getParentFile(), "run"), "report"), referenced);
        removeUnreferencedFiles(new File(dir.getParentFile(), "midscene_run/results"), referenced);
    }

    private void removeUnreferencedFiles(File directory, java.util.Set<String> referenced) {
        File[] files = directory.listFiles();
        if (files == null) {
            return;
        }
        for (File file : files) {
            if (file.isFile() && !referenced.contains(file.getName())) {
                deleteQuietly(file);
            }
        }
    }

    private void removeEmptyDirs() {
        File reports = new File(new File(dir.getParentFile(), "run"), "report");
        File[] files = reports.listFiles();
        if (files != null && files.length == 0) {
            reports.delete();
        }
    }

    /** Remove one run: its index entry, log, result and report files. */
    public synchronized void delete(RunRecord record) {
        JSONArray kept = new JSONArray();
        JSONArray index = readIndex();
        for (int i = 0; i < index.length(); i++) {
            JSONObject item = index.optJSONObject(i);
            if (item == null || record.id.equals(item.optString("id"))) {
                continue;
            }
            kept.put(item);
        }
        try {
            writeJson(indexFile(), wrap(kept));
        } catch (IOException | JSONException error) {
            // the list stays as it was; nothing else to do
        }

        deleteQuietly(new File(dir, record.id + ".json"));
        deleteQuietly(new File(dir, record.id + ".log"));
        if (!record.resultFile.isEmpty()) {
            deleteQuietly(new File(record.resultFile));
        }
        if (!record.reportFile.isEmpty()) {
            deleteQuietly(new File(record.reportFile));
        }
    }

    private void deleteQuietly(File file) {
        try {
            if (file.isFile()) {
                file.delete();
            }
        } catch (Exception ignored) {
            // best effort
        }
    }

    public synchronized List<RunRecord> list() {
        List<RunRecord> records = new ArrayList<>();
        for (int i = 0; i < readIndex().length(); i++) {
            JSONObject item = readIndex().optJSONObject(i);
            if (item != null) {
                records.add(new RunRecord(item));
            }
        }
        Collections.reverse(records);
        return records;
    }

    public synchronized JSONObject readResult(RunRecord record) {
        if (record.resultFile == null || record.resultFile.isEmpty()) {
            return null;
        }
        try {
            String text = new String(
                    Files.readAllBytes(new File(record.resultFile).toPath()),
                    StandardCharsets.UTF_8);
            return new JSONObject(text);
        } catch (IOException | JSONException error) {
            return null;
        }
    }

    public synchronized String readLog(RunRecord record) {
        if (record.logFile == null || record.logFile.isEmpty()) {
            return "";
        }
        try {
            return new String(
                    Files.readAllBytes(new File(record.logFile).toPath()),
                    StandardCharsets.UTF_8);
        } catch (IOException error) {
            return "";
        }
    }

    private File indexFile() {
        return new File(dir, "index.json");
    }

    private JSONArray readIndex() {
        File file = indexFile();
        if (!file.exists()) {
            return new JSONArray();
        }
        try {
            String text = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            return new JSONObject(text).optJSONArray("runs");
        } catch (IOException | JSONException error) {
            return new JSONArray();
        }
    }

    private JSONObject wrap(JSONArray runs) {
        JSONObject root = new JSONObject();
        try {
            root.put("runs", runs);
        } catch (JSONException error) {
            // JSONArray values never fail to serialise; keep the signature simple.
        }
        return root;
    }

    private void writeJson(File file, JSONObject json) throws IOException, JSONException {
        // JSONObject.toString(int) is the pretty printer and declares JSONException.
        Files.write(file.toPath(), json.toString(2).getBytes(StandardCharsets.UTF_8));
    }
}
