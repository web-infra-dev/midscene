package com.midscene.android;

import org.junit.Assume;
import org.junit.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * The family picker must offer exactly the families the agent accepts.
 *
 * The value is matched verbatim, so this list is a copy of the agent's own
 * (`MODEL_FAMILY_VALUES` in `packages/shared/src/env/types.ts`), and a copy drifts: a
 * family added there and missing here is a choice the user cannot make, and one removed
 * there and left here is a config the agent rejects with "Invalid MIDSCENE_MODEL_FAMILY".
 * Reading the source is what turns that drift into a failing test instead of a phone
 * report.
 *
 * Skipped when the file is not there — a checkout of the app on its own still builds.
 */
public class ModelFamilySyncTest {

    private static final Pattern DECLARATION = Pattern.compile(
            "MODEL_FAMILY_VALUES\\s*:[^=]*=\\s*\\[(.*?)]", Pattern.DOTALL);
    private static final Pattern VALUE = Pattern.compile("'([^']+)'");

    @Test
    public void theAppOffersTheFamiliesTheAgentAccepts() throws Exception {
        // apps/android-host -> apps -> the repository root, where the agent's sources live.
        File repoRoot = new File(hostRoot(), "../..").getCanonicalFile();
        File source = new File(repoRoot, "packages/shared/src/env/types.ts");
        Assume.assumeTrue(
                "the monorepo's shared types are not next to this checkout",
                source.isFile());

        List<String> declared = parseFamilies(
                new String(Files.readAllBytes(source.toPath()), StandardCharsets.UTF_8));
        assertTrue("no MODEL_FAMILY_VALUES list found in " + source, declared.size() > 5);
        assertEquals(declared, ModelEnvFile.FAMILY_VALUES);
    }

    /** The value list from the source, blank lines and comments ignored. */
    private static List<String> parseFamilies(String source) {
        int start = source.indexOf("export const MODEL_FAMILY_VALUES");
        assertTrue("MODEL_FAMILY_VALUES is no longer declared as a const array", start >= 0);
        Matcher declaration = DECLARATION.matcher(source.substring(start));
        assertNotNull("MODEL_FAMILY_VALUES has no array literal", declaration);
        assertTrue("MODEL_FAMILY_VALUES has no array literal", declaration.find());

        List<String> values = new ArrayList<>();
        Matcher value = VALUE.matcher(declaration.group(1));
        while (value.find()) {
            values.add(value.group(1));
        }
        return values;
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
