// Runs commands with shell privileges inside the process Shizuku starts for us.
// This is the supported replacement for rish, which Android 14 no longer lets an
// app process use (it aborts with a bare "Aborted").
package com.midscene.localagent;

interface IExecService {
    /** uid of the process running this service (2000 when Shizuku runs as shell). */
    int uid() = 1;

    /** Run one command; returns a JSON envelope {exitCode, stdout, stderr}. */
    String exec(String command, int timeoutMs) = 2;

    /** Run one command and return its raw stdout (screenshots, binary payloads). */
    byte[] execBinary(String command, int timeoutMs) = 3;
}
