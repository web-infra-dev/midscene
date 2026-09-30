package com.midscene.android;

/**
 * The on-device self-check script: three console tabs, then the instruction box, all
 * driven by the app's own UI so one run measures what "locate then act" costs.
 *
 * The wording depends on the form factor, which is the whole point of this class:
 * - the console nav is a bottom bar on phones and a left rail on tablets, and naming
 *   both at once ("左侧导航栏或底部导航栏") makes the model guess. It says 标签栏 rather
 *   than 导航栏 because on Android 导航栏 also means the *system* back/home/recents bar,
 *   which sits right below the app's own bar on a phone;
 * - the instruction box must not be called "首页": on a phone that reads as the Android
 *   *home screen*, so the model goes looking for the launcher. It is anchored on the
 *   "INSTRUCTION" label the page always shows, because the box keeps the last
 *   instruction and therefore often has no placeholder text to recognise;
 * - every label the script names is passed in ({@link Anchors}), because the console is
 *   bilingual and renders its tabs, label and placeholder from resources. A script
 *   written against the English labels would send the model looking for words that are
 *   not on screen once the UI is in Chinese.
 */
public final class SelfCheckScript {

    /** Placeholder the Run page shows in its instruction box while it is empty. */
    public static final String INSTRUCTION_PLACEHOLDER =
            "For example: Open Settings and search for Wi-Fi";

    /** Label above that box; visible whether or not the box already holds an instruction. */
    public static final String INSTRUCTION_LABEL = "INSTRUCTION";

    /** The tab names of the built-in English console. */
    public static final String RUN_TAB = "Run";
    public static final String SCRIPTS_TAB = "Scripts";
    public static final String HISTORY_TAB = "History";

    /** The console copy one script is written against. */
    public static final class Anchors {
        public final String runTab;
        public final String scriptsTab;
        public final String historyTab;
        public final String instructionLabel;
        public final String instructionPlaceholder;

        public Anchors(String runTab, String scriptsTab, String historyTab,
                       String instructionLabel, String instructionPlaceholder) {
            this.runTab = runTab;
            this.scriptsTab = scriptsTab;
            this.historyTab = historyTab;
            this.instructionLabel = instructionLabel;
            this.instructionPlaceholder = instructionPlaceholder;
        }
    }

    /** The English console every constant above describes. */
    public static Anchors englishAnchors() {
        return new Anchors(RUN_TAB, SCRIPTS_TAB, HISTORY_TAB, INSTRUCTION_LABEL,
                INSTRUCTION_PLACEHOLDER);
    }

    private static final String TEMPLATE =
            "name: self-check\n"
                    + "device:\n"
                    + "  backend: device-bridge\n"
                    + "  yadbPath: /data/local/tmp/yadb\n"
                    + "  fileChannelDir: %s\n"
                    + "agent:\n"
                    + "  generateReport: true\n"
                    + "  resetToHome: false\n"
                    + "  reportDir: ./midscene_run/results\n"
                    + "tasks:\n"
                    + "  - name: 01-tab-tour-and-input\n"
                    + "    type: yaml\n"
                    + "    script: |\n"
                    + "      tasks:\n"
                    + "        - name: tab-tour-and-input\n"
                    + "          flow:\n"
                    + "            - aiTap: \"%s里的 %s 标签\"\n"
                    + "            - aiTap: \"%s里的 %s 标签\"\n"
                    + "            - aiTap: \"%s里的 %s 标签\"\n"
                    + "            - aiTap: \"%s\"\n"
                    + "            - aiInput: \"%s\"\n"
                    + "              value: \"open the settings app and search for Wi-Fi\"\n";

    private SelfCheckScript() {
    }

    /** This device's console navigation: a left tab rail or a bottom tab bar. */
    public static String navigation(boolean wide) {
        return wide ? "Midscene 应用内的左侧标签栏" : "Midscene 应用内的底部标签栏";
    }

    /** How the script names the instruction box, in the console's English copy. */
    public static String instructionBox() {
        return instructionBox(englishAnchors());
    }

    /**
     * How the script names the instruction box, on either form factor. The quotes are
     * escaped: this text lands inside a quoted YAML scalar, and the inner script is
     * parsed a second time at run time.
     */
    public static String instructionBox(Anchors anchors) {
        return "「" + anchors.runTab + "」页里的 " + anchors.instructionLabel
                + " 标题下方的指令输入框"
                + "（可能已有一段指令文字；空白时框内灰字提示是 \\\""
                + anchors.instructionPlaceholder + "\\\"）";
    }

    /**
     * The script for one device, naming the English console copy. `wide` is the same
     * width test the console shell uses to choose a navigation rail over a bottom bar.
     */
    public static String config(boolean wide, String channelDir) {
        return config(wide, channelDir, englishAnchors());
    }

    /** The script for one device, anchored on the copy the console is showing. */
    public static String config(boolean wide, String channelDir, Anchors anchors) {
        String nav = navigation(wide);
        String box = instructionBox(anchors);
        return String.format(TEMPLATE, channelDir,
                nav, anchors.scriptsTab, nav, anchors.historyTab, nav, anchors.runTab,
                box, box);
    }
}
