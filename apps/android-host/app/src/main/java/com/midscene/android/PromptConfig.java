package com.midscene.android;

import java.util.Locale;

/**
 * The config the Run page writes for one instruction.
 *
 * Its own class because this is where the app decides what a run is: which device
 * backend, whether a report is generated, and what the task is called. The naming rule
 * is the reason it is not just string concatenation at the call site — a Chinese
 * instruction sanitises to nothing but dashes, and `- name: -` is a YAML sequence
 * marker rather than a scalar, which the runner rejects with a parse error that says
 * nothing about the instruction.
 *
 * Pure text on purpose: a unit test can hold the report switch without running a device.
 */
final class PromptConfig {

    private PromptConfig() {
    }

    /**
     * The YAML for one task.
     *
     * @param deviceBlock       the `device:` block, already rendered
     * @param controllerPackage this app, so the runner can find its own window
     * @param reportDir         where results and (when reports are on) the report go
     * @param generateReport    whether this run keeps a report: the setting exists
     *                          because a report embeds every screenshot of the run
     */
    static String yaml(
            String prompt,
            String deviceBlock,
            String controllerPackage,
            String reportDir,
            boolean generateReport) {
        return "name: prompt-run\n"
                + deviceBlock
                + "agent:\n"
                + "  generateReport: " + generateReport + "\n"
                + "  resetToHome: true\n"
                + "  controllerPackage: " + controllerPackage + "\n"
                + "  reportDir: " + reportDir + "\n"
                + "tasks:\n"
                + "  - name: " + quote(safeName(prompt)) + "\n"
                + "    type: aiAct\n"
                + "    prompt: " + quote(prompt) + "\n";
    }

    /** Turn an instruction into a task name. */
    static String safeName(String prompt) {
        String name = prompt.trim()
                .replaceAll("[^A-Za-z0-9]+", "-")
                .replaceAll("^-+", "")
                .replaceAll("-+$", "")
                .toLowerCase(Locale.US);
        if (name.isEmpty()) {
            name = "task";
        }
        if (name.length() <= 40) {
            return name;
        }
        // Prefer a word boundary over a mid-word cut.
        int cut = name.lastIndexOf('-', 40);
        return cut > 12 ? name.substring(0, cut) : name.substring(0, 40);
    }

    /** One YAML scalar, quoted so an instruction can contain anything. */
    static String quote(String value) {
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", " ")
                .replace("\n", "\\n") + "\"";
    }
}
