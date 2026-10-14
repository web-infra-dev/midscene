package com.midscene.android;

import org.junit.Assume;
import org.junit.Test;

import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Guards the failure that broke the host app end to end: extraction wrote the bundle
 * in one layout while the run path, Diagnostics and ShellRunner looked for the CLI in
 * another. One provision run logged "extracted agent bundle in 1256 ms" and
 * "agent bundle not extracted yet" back to back, and every run failed the same way.
 */
public class BundleLayoutTest {

    /** Where the bundler stages the workspace package; the app has to agree. */
    private static final String BUNDLE_PACKAGE_DIR = "node_modules/@midscene/android-local";

    @Test
    public void cliPathPointsInsideTheStagedPackage() {
        assertTrue("bundle root is the staging install, not the package: "
                        + Provisioner.BUNDLE_CLI_PATH,
                !Provisioner.BUNDLE_CLI_PATH.startsWith("dist/"));
        assertTrue(Provisioner.BUNDLE_CLI_PATH,
                Provisioner.BUNDLE_CLI_PATH.startsWith(BUNDLE_PACKAGE_DIR + "/"));
        assertTrue(Provisioner.BUNDLE_CLI_PATH,
                Provisioner.BUNDLE_CLI_PATH.endsWith("/dist/lib/cli.js"));
    }

    @Test
    public void bundlerStagesThePackageTheCliPathPointsAt() throws Exception {
        String script = new String(
                Files.readAllBytes(new File(hostRoot(), "scripts/bundle-agent.mjs").toPath()),
                StandardCharsets.UTF_8);
        assertTrue("bundler no longer stages " + BUNDLE_PACKAGE_DIR,
                script.contains("'" + BUNDLE_PACKAGE_DIR + "'"));
    }

    @Test
    public void shippedBundleCarriesTheCliAtThatPath() throws Exception {
        File bundle = new File(hostRoot(), "app/src/main/assets/agent-bundle.zip");
        Assume.assumeTrue(
                "agent-bundle.zip is generated; run pnpm --filter android-host bundle first",
                bundle.isFile());

        long bytes = -1;
        try (ZipInputStream zip = new ZipInputStream(new FileInputStream(bundle))) {
            ZipEntry entry;
            byte[] buffer = new byte[64 * 1024];
            while ((entry = zip.getNextEntry()) != null) {
                if (!Provisioner.BUNDLE_CLI_PATH.equals(entry.getName())) {
                    continue;
                }
                bytes = 0;
                int read;
                while ((read = zip.read(buffer)) > 0) {
                    bytes += read;
                }
                break;
            }
        }
        assertTrue("bundle has no " + Provisioner.BUNDLE_CLI_PATH, bytes != -1);
        assertTrue("bundle CLI entry is empty", bytes > 0);
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
