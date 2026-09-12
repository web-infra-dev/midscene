package com.midscene.localagent;

import android.content.Context;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Loopback HTTP bridge between the bundled Node agent and the Shizuku user service.
 *
 * The Node process cannot call Shizuku itself, so it posts commands here and the
 * app forwards them to {@link ShizukuExecBridge}. Only 127.0.0.1 is bound and every
 * request must carry the per-process token that the app passes to Node in its
 * environment, so nothing else on the device can drive the shell channel.
 *
 * `runOnlyOnce` semantics: the server lifetime matches the app process.
 */
public final class ExecBridge {

    private static final String TAG = "MidsceneExecBridge";

    private static ServerSocket server;
    private static String token = "";
    private static volatile boolean started;

    private ExecBridge() {
    }

    public static synchronized void start(Context context) {
        if (started) {
            return;
        }
        started = true;
        ShizukuExecBridge.ensureBound(context);

        try {
            token = UUID.randomUUID().toString().replace("-", "");
            server = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
            Thread thread = new Thread(ExecBridge::acceptLoop, "exec-bridge");
            thread.setDaemon(true);
            thread.start();
            Log.i(TAG, "listening on 127.0.0.1:" + server.getLocalPort());
        } catch (IOException error) {
            started = false;
            Log.e(TAG, "could not start the bridge", error);
        }
    }

    /** Base URL for the agent's environment, or empty when the bridge is down. */
    public static String baseUrl() {
        ServerSocket current = server;
        return current == null ? "" : "http://127.0.0.1:" + current.getLocalPort();
    }

    public static String token() {
        return token;
    }

    private static void acceptLoop() {
        while (true) {
            ServerSocket current = server;
            if (current == null || current.isClosed()) {
                return;
            }
            try (Socket socket = current.accept()) {
                handle(socket);
            } catch (IOException error) {
                if (current.isClosed()) {
                    return;
                }
                Log.w(TAG, "request failed: " + error);
            }
        }
    }

    private static void handle(Socket socket) throws IOException {
        InputStream input = socket.getInputStream();
        OutputStream output = socket.getOutputStream();

        // Read the header block byte-wise (a BufferedReader would swallow body bytes).
        ByteArrayOutputStream headerBytes = new ByteArrayOutputStream();
        int state = 0;
        int value;
        while (state < 4 && (value = input.read()) != -1) {
            headerBytes.write(value);
            if ((state == 0 || state == 2) && value == '\r') {
                state++;
            } else if ((state == 1 || state == 3) && value == '\n') {
                state++;
            } else {
                state = value == '\r' ? 1 : 0;
            }
        }

        String header = headerBytes.toString("UTF-8");
        String[] lines = header.split("\r\n");
        String path = "/";
        if (lines.length > 0 && lines[0].contains(" ")) {
            path = lines[0].split(" ")[1];
        }

        String suppliedToken = null;
        int contentLength = 0;
        for (String line : lines) {
            int separator = line.indexOf(':');
            if (separator < 0) {
                continue;
            }
            String name = line.substring(0, separator).trim().toLowerCase();
            String headerValue = line.substring(separator + 1).trim();
            if ("x-midscene-token".equals(name)) {
                suppliedToken = headerValue;
            } else if ("content-length".equals(name)) {
                contentLength = Integer.parseInt(headerValue);
            }
        }

        byte[] body = new byte[Math.max(contentLength, 0)];
        int read = 0;
        while (read < contentLength) {
            int chunk = input.read(body, read, contentLength - read);
            if (chunk < 0) {
                break;
            }
            read += chunk;
        }
        String command = new String(body, 0, read, StandardCharsets.UTF_8);

        if (!token.equals(suppliedToken)) {
            respond(output, 403, "text/plain", "forbidden".getBytes(StandardCharsets.UTF_8));
            return;
        }
        if (path.startsWith("/ready")) {
            respond(output, 200, "application/json",
                    ("{\"ready\":" + ShizukuExecBridge.isReady() + "}").getBytes(StandardCharsets.UTF_8));
            return;
        }

        int timeoutMs = parseTimeout(path, 30_000);
        try {
            if (path.startsWith("/exec-binary")) {
                respond(output, 200, "application/octet-stream",
                        ShizukuExecBridge.execBinary(command, timeoutMs));
            } else {
                ShizukuExecBridge.Result result = ShizukuExecBridge.exec(command, timeoutMs);
                org.json.JSONObject json = new org.json.JSONObject();
                json.put("exitCode", result.exitCode);
                json.put("stdout", result.stdout);
                json.put("stderr", result.stderr);
                respond(output, 200, "application/json",
                        json.toString().getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception error) {
            respond(output, 500, "text/plain",
                    String.valueOf(error.getMessage()).getBytes(StandardCharsets.UTF_8));
        }
    }

    private static int parseTimeout(String path, int fallback) {
        int index = path.indexOf("timeout=");
        if (index < 0) {
            return fallback;
        }
        StringBuilder digits = new StringBuilder();
        for (int i = index + "timeout=".length(); i < path.length(); i++) {
            char character = path.charAt(i);
            if (!Character.isDigit(character)) {
                break;
            }
            digits.append(character);
        }
        if (digits.length() == 0) {
            return fallback;
        }
        return Math.max(Integer.parseInt(digits.toString()), 1000);
    }

    private static void respond(OutputStream output, int status, String contentType, byte[] body)
            throws IOException {
        String head = "HTTP/1.1 " + status + " " + (status == 200 ? "OK" : "ERROR") + "\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Connection: close\r\n\r\n";
        output.write(head.getBytes(StandardCharsets.UTF_8));
        output.write(body);
        output.flush();
    }
}
