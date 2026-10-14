package com.midscene.android;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * The config a Run-page task is executed from.
 *
 * The report switch is the part worth pinning: it is the difference between a run that
 * keeps every screenshot it took and one that keeps only its log, and it has to reach the
 * runner through this text — there is no flag or environment variable for it.
 */
public class PromptConfigTest {

    private static final String DEVICE = "device:\n"
            + "  backend: device-bridge\n"
            + "  yadbPath: /data/local/tmp/yadb\n"
            + "  fileChannelDir: /data/user/0/com.midscene.android/files/channel\n";

    private static String yaml(boolean generateReport) {
        return PromptConfig.yaml("Open Settings", DEVICE, "com.midscene.android",
                "./midscene_run/results", generateReport);
    }

    @Test
    public void theReportSwitchReachesTheRunner() {
        assertTrue(yaml(true).contains("  generateReport: true\n"));
        assertFalse(yaml(false).contains("generateReport: true"));
        assertTrue(yaml(false).contains("  generateReport: false\n"));
    }

    @Test
    public void theRestOfTheRunIsUnaffectedByTheSwitch() {
        for (boolean generateReport : new boolean[] { true, false }) {
            String text = yaml(generateReport);
            assertTrue(text, text.startsWith("name: prompt-run\n"));
            assertTrue(text, text.contains(DEVICE));
            // The result file is what History counts tasks from, so it is still written.
            assertTrue(text, text.contains("  reportDir: ./midscene_run/results\n"));
            assertTrue(text, text.contains("  resetToHome: true\n"));
            assertTrue(text, text.contains("  controllerPackage: com.midscene.android\n"));
            assertTrue(text, text.contains("    type: aiAct\n"));
            assertTrue(text, text.contains("    prompt: \"Open Settings\"\n"));
        }
    }

    @Test
    public void anInstructionThatWouldBreakTheYamlIsQuoted() {
        String text = PromptConfig.yaml("say \"hi\"\nthen stop", DEVICE, "pkg", "./r", true);
        assertTrue(text, text.contains("prompt: \"say \\\"hi\\\"\\nthen stop\""));
        // A quoted scalar may not contain a raw newline, or the task list ends there.
        assertEquals(1, text.split("\n    prompt: ", -1).length - 1);
    }

    @Test
    public void aNonAsciiInstructionStillNamesTheTask() {
        // Sanitising "打开设置" leaves nothing, and `- name: -` is a YAML sequence marker:
        // the runner would fail to parse the file rather than run the task.
        assertEquals("task", PromptConfig.safeName("打开设置"));
        assertTrue(yaml(true).contains("  - name: \"open-settings\"\n"));
        assertTrue(PromptConfig.yaml("   ", DEVICE, "pkg", "./r", true)
                .contains("  - name: \"task\"\n"));
    }

    @Test
    public void aLongInstructionIsCutAtAWordBoundary() {
        String name = PromptConfig.safeName(
                "open the settings app and then search for the wifi list please");
        assertTrue(name, name.length() <= 40);
        assertFalse(name, name.endsWith("-"));
        assertTrue(name, name.startsWith("open-the-settings-app"));
    }
}
