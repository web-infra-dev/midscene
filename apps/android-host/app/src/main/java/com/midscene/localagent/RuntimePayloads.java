package com.midscene.localagent;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;

/** Bounded payloads, with no dependency on a shared Android user storage mount. */
final class RuntimePayloads {
    static final int MAX_YADB_BYTES = 256 * 1024;
    static final int MAX_CHANNEL_BYTES = 20 * 1024 * 1024;
    static final String CHANNEL_ROOT = "/data/local/tmp/midscene-localagent";

    private RuntimePayloads() {}

    static byte[] readBounded(InputStream source, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[32 * 1024];
        int read;
        while ((read = source.read(buffer)) != -1) {
            if (read > limit - output.size()) {
                throw new IOException("payload exceeds " + limit + " bytes");
            }
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    static File requireChannelFile(File root, String path) throws IOException {
        File file = new File(path).getCanonicalFile();
        if (!file.getPath().startsWith(root.getCanonicalPath() + File.separator)) {
            throw new IOException("path outside the runtime channel: " + path);
        }
        if (!file.isFile() || file.length() > MAX_CHANNEL_BYTES) {
            throw new IOException("channel file missing or too large: " + path);
        }
        return file;
    }

    /** Atomic replacement also works when the old dex is read-only (Android 14+). */
    static void installYadb(File directory, byte[] bytes) throws IOException {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_YADB_BYTES) {
            throw new IOException("invalid yadb payload size");
        }
        File next = File.createTempFile("midscene-yadb-", ".dex", directory);
        try {
            Files.write(next.toPath(), bytes);
            Files.setPosixFilePermissions(next.toPath(),
                    PosixFilePermissions.fromString("r--r--r--"));
            Files.move(next.toPath(), new File(directory, "yadb").toPath(),
                    StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(next.toPath());
        }
    }
}
