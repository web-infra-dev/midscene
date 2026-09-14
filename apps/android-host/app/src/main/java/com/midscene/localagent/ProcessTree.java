package com.midscene.localagent;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Never kill by package substring or UID: only descendants of this process. */
final class ProcessTree {
    private ProcessTree() {}

    static int parentPid(String stat) {
        int end = stat.lastIndexOf(") ");
        if (end < 0) throw new IllegalArgumentException("invalid proc stat");
        return Integer.parseInt(stat.substring(end + 2).trim().split("\\s+")[1]);
    }

    static List<Integer> descendants(int root, Map<Integer, Integer> parents) {
        List<Integer> found = new ArrayList<>();
        List<Integer> pending = new ArrayList<>();
        pending.add(root);
        for (int i = 0; i < pending.size(); i++) {
            int parent = pending.get(i);
            for (Map.Entry<Integer, Integer> entry : parents.entrySet()) {
                int child = entry.getKey();
                if (entry.getValue() == parent && child != root && !pending.contains(child)) {
                    pending.add(child);
                    found.add(0, child); // grandchildren before parents
                }
            }
        }
        return found;
    }

    static void killChildren() {
        File[] entries = new File("/proc").listFiles();
        if (entries == null) return;
        Map<Integer, Integer> parents = new HashMap<>();
        for (File entry : entries) {
            try {
                int pid = Integer.parseInt(entry.getName());
                parents.put(pid, readParent(pid));
            } catch (Exception ignored) {
                // Non-process entry, inaccessible process, or already exited.
            }
        }
        for (int pid : descendants(android.os.Process.myPid(), parents)) {
            try {
                if (readParent(pid) == parents.get(pid)) {
                    android.os.Process.killProcess(pid);
                }
            } catch (Exception ignored) {
                // Do not chase a reparented or already exited process.
            }
        }
    }

    private static int readParent(int pid) throws java.io.IOException {
        return parentPid(new String(Files.readAllBytes(
                new File("/proc/" + pid + "/stat").toPath()), StandardCharsets.UTF_8));
    }
}
