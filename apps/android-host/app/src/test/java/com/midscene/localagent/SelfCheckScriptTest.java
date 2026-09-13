package com.midscene.localagent;

import org.junit.Assume;
import org.junit.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * The self-check script is a prompt: its wording decides whether the model looks in the
 * right place. These tests pin the form-factor rules that came out of real runs — a wrong
 * bar, "导航栏" (which on Android also means the system bar), or "首页" for the instruction
 * box all send the agent hunting somewhere else on a phone.
 */
public class SelfCheckScriptTest {

    private static final String CHANNEL =
            "/storage/emulated/0/Android/data/com.midscene.localagent/files/channel";

    @Test
    public void navigationNamesOneBarPerFormFactor() {
        assertTrue(SelfCheckScript.navigation(true).contains("左侧"));
        assertTrue(SelfCheckScript.navigation(false).contains("底部"));
    }

    @Test
    public void phoneScriptNamesTheBottomBarAndNeverTheRail() {
        String script = SelfCheckScript.config(false, CHANNEL);

        assertTrue(script.contains("Midscene 应用内的底部标签栏里的 Scripts 标签"));
        assertTrue(script.contains("里的 History 标签"));
        assertTrue(script.contains("里的 Run 标签"));
        assertFalse("a phone has no left rail to look for", script.contains("左侧"));
    }

    @Test
    public void tabletScriptNamesTheRailAndNeverTheBottomBar() {
        String script = SelfCheckScript.config(true, CHANNEL);

        assertTrue(script.contains("Midscene 应用内的左侧标签栏里的 Scripts 标签"));
        assertFalse("a tablet has no bottom bar to look for", script.contains("底部"));
    }

    @Test
    public void navigationAvoidsTheSystemNavigationBarWord() {
        for (String script : new String[]{
                SelfCheckScript.config(false, CHANNEL),
                SelfCheckScript.config(true, CHANNEL)}) {
            // 导航栏 reads as the system back/home/recents bar, which on a phone sits
            // right below the app's own tab bar.
            assertFalse("ambiguous 导航栏 in: " + script, script.contains("导航栏"));
        }
    }

    @Test
    public void instructionBoxIsAnchoredOnItsAlwaysVisibleLabel() {
        for (String script : new String[]{
                SelfCheckScript.config(false, CHANNEL),
                SelfCheckScript.config(true, CHANNEL)}) {
            // The box keeps the last instruction, so the placeholder is often not on
            // screen: a run failed locating it by placeholder alone.
            assertTrue(script.contains(SelfCheckScript.INSTRUCTION_LABEL + " 标题下方的指令输入框"));
            assertTrue(script.contains("可能已有一段指令文字"));
            assertTrue(script.contains(SelfCheckScript.INSTRUCTION_PLACEHOLDER));
            // "首页" is the Android home screen on a phone, not this app's Run tab.
            assertFalse(script.contains("首页"));
            assertFalse(script.contains("自然语言"));
        }
    }

    @Test
    public void nestedQuotesStayEscapedSoTheInnerYamlParses() {
        String script = SelfCheckScript.config(false, CHANNEL);

        assertTrue(script.contains("灰字提示是 \\\"" + SelfCheckScript.INSTRUCTION_PLACEHOLDER + "\\\""));
    }

    @Test
    public void channelDirAndValueAreCarriedThrough() {
        String script = SelfCheckScript.config(true, CHANNEL);

        assertTrue(script.contains("fileChannelDir: " + CHANNEL));
        assertTrue(script.contains("value: \"open the settings app and search for Wi-Fi\""));
        assertTrue(script.contains("resetToHome: false"));
    }

    @Test
    public void checkedInExampleKeepsTheSameAnchors() throws Exception {
        File example = new File(hostRoot(),
                "../../packages/android-local/examples/self-check.yaml");
        Assume.assumeTrue("example copy lives in the repository", example.isFile());

        // Comments may discuss the wording ("首页" reads as the home screen); only the
        // steps are what the model is handed.
        StringBuilder steps = new StringBuilder();
        for (String line : new String(Files.readAllBytes(example.toPath()),
                StandardCharsets.UTF_8).split("\n")) {
            if (!line.trim().startsWith("#")) {
                steps.append(line).append('\n');
            }
        }
        String script = steps.toString();

        assertTrue("example lost the placeholder anchor",
                script.contains(SelfCheckScript.INSTRUCTION_PLACEHOLDER));
        assertTrue("example lost the INSTRUCTION label anchor",
                script.contains(SelfCheckScript.INSTRUCTION_LABEL + " 标题下方"));
        assertFalse("example still calls the instruction box 首页", script.contains("首页"));
        assertFalse("example uses the ambiguous 导航栏", script.contains("导航栏"));
        assertTrue("example should say where the bar is per form factor",
                script.contains("底部") && script.contains("左侧"));
    }

    /** Unit tests run with the module directory as cwd; walk up to the host app root. */
    private static File hostRoot() {
        File dir = new File("").getAbsoluteFile();
        while (dir != null && !new File(dir, "scripts/bundle-agent.mjs").isFile()) {
            dir = dir.getParentFile();
        }
        assertNotNull("could not find scripts/bundle-agent.mjs above "
                + new File("").getAbsolutePath(), dir);
        return dir;
    }
}
