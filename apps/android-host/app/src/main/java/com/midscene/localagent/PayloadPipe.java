package com.midscene.localagent;

import android.os.ParcelFileDescriptor;

import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Only descriptors cross Binder; pipe bytes avoid both its size limit and FUSE. */
final class PayloadPipe {
    private static final ThreadPoolExecutor WRITERS = new ThreadPoolExecutor(
            2, 2, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(8));
    private static final ScheduledThreadPoolExecutor DEADLINES =
            new ScheduledThreadPoolExecutor(1);

    static {
        DEADLINES.setRemoveOnCancelPolicy(true);
    }

    private PayloadPipe() {}

    static ParcelFileDescriptor open(InputStream source) throws IOException {
        ParcelFileDescriptor[] pipe;
        try {
            pipe = ParcelFileDescriptor.createReliablePipe();
        } catch (IOException error) {
            source.close();
            throw error;
        }
        ScheduledFuture<?> deadline = DEADLINES.schedule(
                () -> fail(pipe[1], "payload transfer timed out"), 30, TimeUnit.SECONDS);
        try {
            WRITERS.execute(() -> {
                try (InputStream input = source;
                     ParcelFileDescriptor.AutoCloseOutputStream output =
                             new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])) {
                    byte[] buffer = new byte[32 * 1024];
                    int total = 0;
                    int read;
                    try {
                        while ((read = input.read(buffer)) != -1) {
                            total += read;
                            if (total > RuntimePayloads.MAX_CHANNEL_BYTES) {
                                throw new IOException("channel payload too large");
                            }
                            output.write(buffer, 0, read);
                        }
                    } catch (IOException error) {
                        // Signal before AutoCloseOutputStream closes the reliable end.
                        fail(pipe[1], error.toString());
                    }
                } catch (IOException error) {
                    fail(pipe[1], error.toString());
                } finally {
                    deadline.cancel(false);
                }
            });
        } catch (RuntimeException rejected) {
            deadline.cancel(false);
            source.close();
            pipe[0].close();
            pipe[1].close();
            throw new IOException("payload transfer queue full", rejected);
        }
        return pipe[0];
    }

    private static void fail(ParcelFileDescriptor descriptor, String message) {
        try {
            descriptor.closeWithError(message);
        } catch (IOException ignored) {
            // The peer may already have closed the pipe.
        }
    }
}
