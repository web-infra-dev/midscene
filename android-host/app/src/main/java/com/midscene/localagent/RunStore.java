package com.midscene.localagent;

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
