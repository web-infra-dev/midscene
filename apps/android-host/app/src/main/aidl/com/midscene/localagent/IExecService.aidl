// Runs commands with shell privileges inside the process Shizuku starts for us.
// This is the supported replacement for rish, which Android 14 no longer lets an
// app process use (it aborts with a bare "Aborted").
package com.midscene.localagent;

import android.os.ParcelFileDescriptor;

interface IExecService {
    /** uid of the process running this service (2000 when Shizuku runs as shell). */
    int uid() = 1;

    /** Run one command; returns a JSON envelope {exitCode, stdout, stderr}. */
    String exec(String command, int timeoutMs) = 2;

    /** Run one command and return its raw stdout (screenshots, binary payloads). */
    ParcelFileDescriptor execBinary(String command, int timeoutMs) = 3;

    /** Small bundled dex only; fixed destination, not an arbitrary file writer. */
    void installYadb(in byte[] bytes) = 4;

    /** Large files stream through a pipe, never as a Binder byte array. */
    ParcelFileDescriptor readChannelFile(String path) = 5;

    /** Required by Shizuku when replacing or removing a service version. */
    void destroy() = 16777114;
}
