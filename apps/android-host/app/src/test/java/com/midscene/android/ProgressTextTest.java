package com.midscene.android;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * The overlay's copy is what a person reads while the agent drives the phone, so its
 * wording is pinned here: sentence case, labelled numbers, and no raw payloads.
 */
public class ProgressTextTest {

    @Test
    public void phasesReadAsSentencesNotRunnerJargon() {
        assertEquals("Starting", ProgressText.phaseLabel("starting"));
        assertEquals("Working", ProgressText.phaseLabel("acting"));
        assertEquals("Checking", ProgressText.phaseLabel("asserting"));
        assertEquals("Step done", ProgressText.phaseLabel("step done"));
        assertEquals("Step failed", ProgressText.phaseLabel("step failed"));
        assertEquals("Done", ProgressText.phaseLabel("done"));
        assertEquals("Failed", ProgressText.phaseLabel("failed"));
    }

    @Test
    public void unknownPhasesAreTidiedRatherThanDropped() {
        assertEquals("Working", ProgressText.phaseLabel(""));
        assertEquals("Working", ProgressText.phaseLabel(null));
        // The service also sends ready-made sentences through the same slot.
        assertEquals("Starting config…", ProgressText.phaseLabel("Starting config…"));
        assertEquals("Ready", ProgressText.phaseLabel("Ready"));
        assertEquals("On device", ProgressText.phaseLabel("on-device"));
    }

    @Test
    public void stepChipCarriesItsLabel() {
        assertEquals("Step 2/5", ProgressText.stepChip(2, 5));
        assertEquals("Step 1/1", ProgressText.stepChip(0, 1));
        assertEquals("", ProgressText.stepChip(0, 0));
    }

    @Test
    public void timingsAreLabelledAndDropWhatIsUnknown() {
        assertEquals("Step 4.2s · Total 26s", ProgressText.timings(4200, 26000));
        assertEquals("Step 4.2s", ProgressText.timings(4200, 0));
        assertEquals("Total 1:04", ProgressText.timings(0, 64000));
        assertEquals("", ProgressText.timings(0, 0));
        assertEquals("Step 12s · Total 2:05", ProgressText.timings(12500, 125000));
    }

    @Test
    public void durationsStayShortButInformative() {
        assertEquals("0.4s", ProgressText.duration(400));
        assertEquals("4.2s", ProgressText.duration(4200));
        assertEquals("26s", ProgressText.duration(26800));
        assertEquals("1:04", ProgressText.duration(64500));
        assertEquals("12:05", ProgressText.duration(725000));
    }

    @Test
    public void naturalLanguagePromptsSurviveWithTidying() {
        assertEquals("Open the Settings app",
                ProgressText.describe("  open the Settings app\n"));
        assertEquals("Tap the Wi-Fi row",
                ProgressText.describe("\"tap the Wi-Fi row\""));
    }

    @Test
    public void slugStepNamesBecomeWords() {
        assertEquals("Open the settings app",
                ProgressText.describe("open-the-settings-app"));
        assertEquals("Tab tour and input",
                ProgressText.describe("tab-tour-and-input"));
    }

    @Test
    public void scriptDumpsBecomeASummaryOfWhatTheyDo() {
        String script = "script: tasks:\n"
                + "  - name: tab-tour-and-input\n"
                + "    flow:\n"
                + "      - aiTap: \"Scripts 标签\"\n"
                + "      - aiTap: \"History 标签\"\n"
                + "      - aiInput: \"首页输入框\"\n"
                + "        value: \"open the settings app\"\n";

        String described = ProgressText.describe(script);

        assertEquals("Script · 3 actions · first: tap \"Scripts 标签\"", described);
        assertFalse("raw YAML must not reach the bar", described.contains("flow:"));
        assertFalse(described.contains("tasks:"));
    }

    @Test
    public void singleActionScriptsUseTheSingular() {
        String described = ProgressText.describe(
                "script: tasks:\n  - name: one\n    flow:\n      - aiAssert: \"it worked\"\n");

        assertEquals("Script · 1 action · first: check \"it worked\"", described);
    }

    @Test
    public void scriptVerbsAreCalledWhatTheUiCallsThem() {
        String described = ProgressText.describe(
                "script: tasks:\n  - flow:\n      - runAdbShell: \"input keyevent 3\"\n");

        assertEquals("Script · 1 action · first: run a shell command \"input keyevent 3\"",
                described);
    }

    @Test
    public void emptyPromptsProduceAnEmptySlot() {
        assertEquals("", ProgressText.describe(null));
        assertEquals("", ProgressText.describe("   \n  "));
    }

    @Test
    public void deviceActionsReadAsSentences() {
        assertEquals("Tap \"Scripts 标签\"", ProgressText.actionLabel("Tap - Scripts 标签"));
        assertEquals("Type \"open settings\"", ProgressText.actionLabel("Input - open settings"));
        assertEquals("Scroll \"down\"", ProgressText.actionLabel("Scroll - down"));
        assertEquals("Wait 1.5s", ProgressText.actionLabel("Sleep - 1500"));
        assertEquals("Back", ProgressText.actionLabel("Back"));
        assertEquals("", ProgressText.actionLabel(null));
    }

    /** The shapes real runs produce, taken from a device log. */
    @Test
    public void realActionTipsBecomeOneShortLine() {
        // A script step names the element it is after; the description is long by design,
        // so the label keeps the opening words and marks the cut.
        String longStep = ProgressText.actionLabel(
                "Tap - Run 页里 INSTRUCTION 标题下方的指令输入框（可能已有一段指令文字；空白时框内灰字提示是 \"For example: Open Settings and search for Wi-Fi\"）");
        assertTrue(longStep, longStep.startsWith("Tap \"Run 页里 INSTRUCTION"));
        assertTrue(longStep, longStep.endsWith("…\""));
        assertTrue(longStep, longStep.length() < 60);
        // An AI-planned action carries its params; the prompt inside them is the point.
        String planned = ProgressText.actionLabel(
                "Tap - {\"prompt\":\"Settings app icon (gear symbol) in the app drawer\","
                        + "\"locatedPixelResult\":{\"center\":[151,1087]}}");
        assertTrue(planned, planned.startsWith("Tap \"Settings app icon (gear symbol)"));
        assertTrue(planned, planned.endsWith("…\""));
        assertFalse("no JSON in the bar", planned.contains("locatedPixelResult"));
        // JS-object style params, and a wait that should read as a duration.
        assertEquals("Open \"settings\"", ProgressText.actionLabel("Launch - { uri: 'settings' }"));
        assertEquals("Wait 1.2s", ProgressText.actionLabel("Sleep - {\"timeMs\":1200}"));
        // An input tip appends what it typed after the field description: the value wins,
        // capped like everything else so the bar stays one line.
        String typed = ProgressText.actionLabel(
                "Input - Run 页里的指令输入框（可能已有一段指令文字） - open the settings app and search for Wi-Fi");
        assertTrue(typed, typed.startsWith("Type \"open the settings app and search for Wi-"));
        assertTrue(typed, typed.endsWith("…\""));
        // Nothing readable in the blob: the verb alone beats a wall of JSON.
        assertEquals("Tap", ProgressText.actionLabel("Tap - {\"locatedPixelResult\":{\"center\":[1,2]}}"));
    }

    @Test
    public void scriptStepsPreferTheLiveActionOverTheScriptSummary() {
        String script = "script: tasks:\n  - flow:\n      - aiTap: \"Scripts 标签\"\n      - aiTap: \"History 标签\"\n";

        // Before the first action arrives, the summary stands in for it.
        assertEquals("Script · 2 actions · first: tap \"Scripts 标签\"",
                ProgressText.describeStep(script, ""));
        // Afterwards the live action is shorter and says what is happening now.
        assertEquals("Tap \"History 标签\"",
                ProgressText.describeStep(script, "Tap - History 标签"));
        // A plain prompt is the user's own instruction; the action only fills a gap.
        assertEquals("Open the Settings app",
                ProgressText.describeStep("open the Settings app", "Tap - Settings"));
        assertEquals("Tap \"Settings\"", ProgressText.describeStep("", "Tap - Settings"));
    }

    @Test
    public void notificationCopyStaysShort() {
        assertEquals("Working · 2/5", ProgressText.notificationTitle("Working", "2/5"));
        assertEquals("Done", ProgressText.notificationTitle("Done", ""));
        assertEquals("Tap \"Wi-Fi\" · 15s",
                ProgressText.notificationText("Tap \"Wi-Fi\"", 15000));
        assertEquals("15s", ProgressText.notificationText("", 15000));
        assertEquals("Idle", ProgressText.notificationText("Idle", 0));
    }

    @Test
    public void runBookkeepingLinesNeverBecomeTheHeadline() {
        assertEquals("Extracted agent bundle in 1113 ms",
                ProgressText.summarize("=== run 20260913-003357 ===", "Extracted agent bundle in 1113 ms"));
    }

    @Test
    public void logTailsAreHumanised() {
        assertEquals("Running the self check",
                ProgressText.summarize("[task] running the self check", ""));
        assertEquals("Exit code 0", ProgressText.summarize("[00:12:37] exit code 0", ""));
        assertEquals("Prompt config written: /data/x.yaml",
                ProgressText.summarize("prompt config written: /data/x.yaml", ""));
        // A file name keeps its own casing; "Model.env" is not a sentence opening.
        assertEquals("model.env: injecting 4 variables",
                ProgressText.summarize("model.env: injecting 4 variables", ""));
    }

    @Test
    public void structuredEventsNeverShowAsRawJson() {
        String previous = "Waiting for the model";

        assertEquals(previous, ProgressText.summarize(
                "[event] {\"event\":\"step.start\",\"prompt\":\"open settings\"}", previous));
        assertEquals(previous, ProgressText.summarize("{\"event\":\"run.end\"}", previous));
        assertEquals("", ProgressText.summarize("{\"a\":1}", ""));
    }

    @Test
    public void aNullLineKeepsThePreviousText() {
        assertEquals("Working", ProgressText.summarize(null, "Working"));
        assertTrue(ProgressText.summarize("", "Working").contains("Working"));
    }

    @Test
    public void installedVocabularyReplacesTheEnglishWords() {
        ProgressText.useWords(new ProgressText.Words() {
            @Override
            public String text(String key, String fallback, Object... args) {
                if ("phase.working".equals(key)) {
                    return "运行中";
                }
                return args.length == 0 ? fallback : String.format(fallback, args);
            }

            @Override
            public String quantity(String key, int count, String one, String other) {
                return count + " 个动作";
            }
        });
        try {
            assertEquals("运行中", ProgressText.phaseLabel("acting"));
            // A slot the vocabulary does not translate keeps the English default.
            assertEquals("Done", ProgressText.phaseLabel("done"));
            assertEquals("Step 2/5", ProgressText.stepChip(2, 5));
            assertTrue(ProgressText.describe("script:\n  - aiTap: \"Wi-Fi\"")
                    .contains("1 个动作"));
        } finally {
            ProgressText.useWords(null);
        }
        // Null restores the built-in English, which is what the unit tests read.
        assertEquals("Working", ProgressText.phaseLabel("acting"));
    }
}
