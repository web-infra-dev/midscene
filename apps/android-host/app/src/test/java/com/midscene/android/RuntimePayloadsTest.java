package com.midscene.android;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Arrays;

import static org.junit.Assert.*;

public class RuntimePayloadsTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();

    @Test public void readsPayloadLargerThanBinderTransaction() throws Exception {
        byte[] png = new byte[2 * 1024 * 1024];
        Arrays.fill(png, (byte) 171);
        assertArrayEquals(png, RuntimePayloads.readBounded(
                new ByteArrayInputStream(png), RuntimePayloads.MAX_CHANNEL_BYTES));
    }

    @Test public void rejectsOversizedPayloadRatherThanTruncating() {
        assertThrows(IOException.class, () -> RuntimePayloads.readBounded(
                new ByteArrayInputStream(new byte[33]), 32));
    }

    @Test public void verifiesOwnChannelAndRejectsOtherUsersAndTraversal() throws Exception {
        File user11 = temp.newFolder("u11");
        File user0 = temp.newFolder("u0");
        File own = new File(user11, "screen.png");
        File other = new File(user0, "screen.png");
        Files.write(own.toPath(), new byte[]{1});
        Files.write(other.toPath(), new byte[]{2});
        assertEquals(own.getCanonicalFile(), RuntimePayloads.requireChannelFile(user11, own.getPath()));
        assertThrows(IOException.class, () -> RuntimePayloads.requireChannelFile(user11,
                new File(user11, "../u0/screen.png").getPath()));
        File sibling = temp.newFolder("u110");
        File siblingFile = new File(sibling, "screen.png");
        Files.write(siblingFile.toPath(), new byte[]{3});
        assertThrows(IOException.class, () -> RuntimePayloads.requireChannelFile(user11,
                siblingFile.getPath()));
        File link = new File(user11, "link.png");
        Files.createSymbolicLink(link.toPath(), other.toPath());
        assertThrows(IOException.class, () -> RuntimePayloads.requireChannelFile(user11, link.getPath()));
        assertThrows(IOException.class, () -> RuntimePayloads.requireChannelFile(user11, user11.getPath()));
    }

    @Test public void atomicallyReplacesReadOnlyYadbAndRejectsInvalidInput() throws Exception {
        File directory = temp.newFolder("shell");
        byte[] first = {1, 2, 3};
        byte[] second = {4, 5, 6};
        RuntimePayloads.installYadb(directory, first);
        File target = new File(directory, "yadb");
        RuntimePayloads.installYadb(directory, second);
        assertArrayEquals(second, Files.readAllBytes(target.toPath()));
        assertEquals(PosixFilePermissions.fromString("r--r--r--"),
                Files.getPosixFilePermissions(target.toPath()));
        assertThrows(IOException.class, () -> RuntimePayloads.installYadb(directory, null));
        assertThrows(IOException.class, () -> RuntimePayloads.installYadb(directory, new byte[0]));
        assertThrows(IOException.class, () -> RuntimePayloads.installYadb(directory,
                new byte[RuntimePayloads.MAX_YADB_BYTES + 1]));
        assertArrayEquals(second, Files.readAllBytes(target.toPath()));
        assertArrayEquals(new String[]{"yadb"}, directory.list());
    }

    @Test public void failedCliCannotBeReportedAsReady() throws Exception {
        Provisioner.requireCliSuccess(0);
        assertThrows(IOException.class, () -> Provisioner.requireCliSuccess(1));
        assertThrows(IOException.class, () -> Provisioner.requireCliSuccess(-1));
    }
}
