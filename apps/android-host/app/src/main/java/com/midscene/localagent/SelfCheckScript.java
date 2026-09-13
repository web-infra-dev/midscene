package com.midscene.localagent;

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
 * - the box's placeholder is still named, as a secondary hint, from the one constant the
 *   Run page renders, so the script and the UI cannot drift.
 */
public final class SelfCheckScript {

    /** Placeholder the Run page shows in its instruction box while it is empty. */
    public static final String INSTRUCTION_PLACEHOLDER =
            "For example: Open Settings and search for Wi-Fi";

    /** Label above that box; visible whether or not the box already holds an instruction. */
    public static final String INSTRUCTION_LABEL = "INSTRUCTION";

    private static final String TEMPLATE =
            "name: self-check\n"
                    + "device:\n"
                    + "  backend: rish\n"
                    + "  rishPath: /data/local/tmp/rish\n"
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
                    + "            - aiTap: \"%s里的 Scripts 标签\"\n"
                    + "            - aiTap: \"%s里的 History 标签\"\n"
                    + "            - aiTap: \"%s里的 Run 标签\"\n"
                    + "            - aiTap: \"%s\"\n"
                    + "            - aiInput: \"%s\"\n"
                    + "              value: \"open the settings app and search for Wi-Fi\"\n";

    private SelfCheckScript() {
    }

    /** This device's console navigation: a left tab rail or a bottom tab bar. */
    public static String navigation(boolean wide) {
        return wide ? "Midscene 应用内的左侧标签栏" : "Midscene 应用内的底部标签栏";
    }

    /**
     * How the script names the instruction box, on either form factor. The quotes are
     * escaped: this text lands inside a quoted YAML scalar, and the inner script is
     * parsed a second time at run time.
     */
    public static String instructionBox() {
        return "Run 页里 " + INSTRUCTION_LABEL + " 标题下方的指令输入框"
                + "（可能已有一段指令文字；空白时框内灰字提示是 \\\""
                + INSTRUCTION_PLACEHOLDER + "\\\"）";
    }

    /**
     * The script for one device. `wide` is the same width test the console shell uses to
     * choose a navigation rail over a bottom bar.
     */
    public static String config(boolean wide, String channelDir) {
        String nav = navigation(wide);
        String box = instructionBox();
        return String.format(TEMPLATE, channelDir, nav, nav, nav, box, box);
    }
}
