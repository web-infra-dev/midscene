package com.midscene.android;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;

/**
 * One live round trip against the configured model endpoint.
 *
 * A filled-in form says nothing about whether the configuration works: a base URL missing
 * its {@code /v1}, a key for another account, a model name that service does not serve and
 * a model that cannot see images all look the same in a text field, and the first sign of
 * any of them is a run that fails minutes later. This sends the smallest request that can
 * tell the difference and reports what came back — including the service's own words when
 * it refuses.
 *
 * The probe carries an image on purpose. The agent is a vision agent, so the endpoint has
 * to accept an image content part; asking a text-only model to describe one fails here
 * instead of at the first task.
 *
 * The URL is built the way the agent's own client builds it — base URL plus
 * {@code /chat/completions} — so a test that passes means the agent's request would be
 * accepted too.
 *
 * No Android types on purpose: the outcome is a {@link Failure} plus the raw text that came
 * with it, and the screen turns those into a sentence. That keeps the network behaviour
 * testable against a real local server, and the wording in the one place that knows the
 * user's language.
 */
public final class ModelConnectionTest {

    /** Why an attempt did not work; {@code null} when it did. */
    public enum Failure {
        /** One of the four values is empty, so nothing was sent. */
        INCOMPLETE,
        /** The address does not resolve. */
        HOST,
        /** No answer before the read timeout. */
        TIMEOUT,
        /** Anything else that stopped the request: no route, TLS, connection refused. */
        NETWORK,
        /** The service rejected the key. */
        AUTH,
        /** No such endpoint or model name. */
        NOT_FOUND,
        /** The service refused the request itself. */
        BAD_REQUEST,
        /** Any other status. */
        HTTP,
        /** A 2xx that was not a chat completion. */
        BODY,
        /** A completion with no content in it. */
        EMPTY_REPLY
    }

    /** What came back: the model's reply when it worked, the raw reason when it did not. */
    public static final class Result {
        public final boolean ok;
        /** 0 when no response arrived at all. */
        public final int httpStatus;
        /** Null when {@link #ok}. */
        public final Failure failure;
        /**
         * The model's reply when it worked. When it did not: the service's own error text,
         * an exception message, or the body that could not be read — possibly empty, and
         * never a sentence the app wrote.
         */
        public final String detail;
        public final long elapsedMs;

        Result(boolean ok, int httpStatus, Failure failure, String detail, long elapsedMs) {
            this.ok = ok;
            this.httpStatus = httpStatus;
            this.failure = failure;
            this.detail = detail == null ? "" : detail;
            this.elapsedMs = elapsedMs;
        }
    }

    /**
     * A 64x64 red PNG (136 bytes), inlined because the probe has to be one request.
     *
     * The side is not decoration: a 2x2 image is rejected by services that put a floor under
     * what they will look at — DashScope answers "The image length and width do not meet the
     * model restrictions. [height:2 or width:2 must be larger than 10]" — which turns a
     * perfectly good configuration into a red line in the form. 64 is above every minimum
     * seen so far and still costs one image tile. The colour matters too: the question about
     * it has one obvious answer, which is what makes a text-only model fail rather than
     * hallucinate.
     */
    static final String PROBE_IMAGE =
            "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsEty/UMZxgi+hcEK"
                    + "LNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLPLIEA68ZURwAA"
                    + "AABJRU5ErkJggg==";

    static final String PROBE_PROMPT = "What colour is this image? Answer with one word.";

    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    /** Enough of a provider's error to be useful on a notification-sized line. */
    private static final int MAX_DETAIL = 300;

    private ModelConnectionTest() {
    }

    /**
     * Ask the endpoint to describe a small red image.
     *
     * Blocking: callers run it off the main thread.
     */
    public static Result run(ModelEnvFile.Connection connection) {
        long started = System.currentTimeMillis();
        if (!connection.complete()) {
            return new Result(false, 0, Failure.INCOMPLETE, "", 0);
        }
        String endpoint = completionUrl(connection.baseUrl);
        if (endpoint.isEmpty()) {
            return new Result(false, 0, Failure.INCOMPLETE, "", 0);
        }

        HttpURLConnection http = null;
        try {
            http = (HttpURLConnection) new URL(endpoint).openConnection();
            http.setRequestMethod("POST");
            http.setConnectTimeout(CONNECT_TIMEOUT_MS);
            http.setReadTimeout(READ_TIMEOUT_MS);
            http.setDoOutput(true);
            http.setRequestProperty("Content-Type", "application/json");
            http.setRequestProperty("Accept", "application/json");
            http.setRequestProperty("Authorization", "Bearer " + connection.apiKey);
            http.setRequestProperty("User-Agent", "Midscene-Android");
            byte[] payload = requestBody(connection.model).getBytes(StandardCharsets.UTF_8);
            http.setFixedLengthStreamingMode(payload.length);
            try (OutputStream body = http.getOutputStream()) {
                body.write(payload);
            }

            int status = http.getResponseCode();
            String response = readBody(http, status);
            return interpret(status, response, System.currentTimeMillis() - started);
        } catch (UnknownHostException error) {
            return failed(Failure.HOST, error, started);
        } catch (SocketTimeoutException error) {
            return failed(Failure.TIMEOUT, error, started);
        } catch (IOException error) {
            return failed(Failure.NETWORK, error, started);
        } catch (JSONException error) {
            // The request body is built here, so this is a bug rather than a bad config.
            return failed(Failure.BODY, error, started);
        } finally {
            if (http != null) {
                http.disconnect();
            }
        }
    }

    /**
     * The endpoint the agent itself would call: the base URL plus {@code /chat/completions}.
     *
     * A value that already names the full path is left alone — the desktop studio accepts
     * both shapes, and appending twice produces a 404 that blames the user's endpoint.
     */
    static String completionUrl(String baseUrl) {
        String trimmed = baseUrl == null ? "" : baseUrl.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        if (trimmed.isEmpty()) {
            return "";
        }
        return trimmed.endsWith("/chat/completions") ? trimmed : trimmed + "/chat/completions";
    }

    /** An OpenAI-compatible chat completion carrying one image. */
    static String requestBody(String model) throws JSONException {
        JSONObject message = new JSONObject()
                .put("role", "user")
                .put("content", new JSONArray()
                        .put(new JSONObject().put("type", "text").put("text", PROBE_PROMPT))
                        .put(new JSONObject()
                                .put("type", "image_url")
                                .put("image_url", new JSONObject()
                                        .put("url", "data:image/png;base64," + PROBE_IMAGE))));
        return new JSONObject()
                .put("model", model)
                .put("messages", new JSONArray().put(message))
                .toString();
    }

    /** Turn one HTTP response into a result, in the service's own words where there are any. */
    static Result interpret(int status, String body, long elapsedMs) {
        if (status >= 200 && status < 300) {
            try {
                JSONArray choices = new JSONObject(body).optJSONArray("choices");
                JSONObject message = choices == null || choices.length() == 0
                        ? null : choices.optJSONObject(0).optJSONObject("message");
                String reply = message == null ? "" : message.optString("content", "").trim();
                if (reply.isEmpty()) {
                    return new Result(false, status, Failure.EMPTY_REPLY, snippet(body),
                            elapsedMs);
                }
                return new Result(true, status, null, snippet(reply), elapsedMs);
            } catch (JSONException error) {
                return new Result(false, status, Failure.BODY, snippet(body), elapsedMs);
            }
        }

        Failure failure;
        if (status == 401 || status == 403) {
            failure = Failure.AUTH;
        } else if (status == 404) {
            failure = Failure.NOT_FOUND;
        } else if (status == 400 || status == 422) {
            failure = Failure.BAD_REQUEST;
        } else {
            failure = Failure.HTTP;
        }
        return new Result(false, status, failure, providerMessage(body), elapsedMs);
    }

    /**
     * The error text out of an OpenAI-shaped error body, or the body itself.
     *
     * Services disagree about where the sentence lives (`error.message`, `message`,
     * `error` as a string), and this is the part the user has to act on, so all three are
     * read before falling back to the raw body.
     */
    static String providerMessage(String body) {
        if (body == null || body.trim().isEmpty()) {
            return "";
        }
        try {
            JSONObject json = new JSONObject(body);
            JSONObject error = json.optJSONObject("error");
            if (error != null && !error.optString("message", "").trim().isEmpty()) {
                return snippet(error.optString("message").trim());
            }
            if (!json.optString("message", "").trim().isEmpty()) {
                return snippet(json.optString("message").trim());
            }
            if (!json.optString("error", "").trim().isEmpty()) {
                return snippet(json.optString("error").trim());
            }
            return snippet(body);
        } catch (JSONException error) {
            return snippet(body);
        }
    }

    private static Result failed(Failure failure, Exception error, long started) {
        return new Result(false, 0, failure, String.valueOf(error.getMessage()),
                System.currentTimeMillis() - started);
    }

    /**
     * The response body, whether the platform hands it over as an error stream or not.
     *
     * A refusal's body is where the service says *which* key or model name is wrong, so it
     * is worth one extra attempt. Not every implementation exposes it — the JDK's
     * HttpURLConnection returns null here while Android's does not — and a status without a
     * body is still a usable answer, so a missing one is not turned into a network failure.
     */
    private static String readBody(HttpURLConnection http, int status) {
        if (status >= 400) {
            InputStream error = http.getErrorStream();
            if (error != null) {
                try {
                    return read(error);
                } catch (IOException ignored) {
                    // Fall through to the input stream, which some implementations use for
                    // the very same bytes.
                }
            }
        }
        try {
            return read(http.getInputStream());
        } catch (IOException ignored) {
            return "";
        }
    }

    private static String snippet(String text) {
        String collapsed = text == null ? "" : text.replaceAll("\\s+", " ").trim();
        return collapsed.length() <= MAX_DETAIL
                ? collapsed
                : collapsed.substring(0, MAX_DETAIL) + "…";
    }

    private static String read(InputStream stream) throws IOException {
        if (stream == null) {
            return "";
        }
        ByteArrayOutputStream sink = new ByteArrayOutputStream();
        byte[] buffer = new byte[8 * 1024];
        int count;
        while ((count = stream.read(buffer)) > 0) {
            sink.write(buffer, 0, count);
            if (sink.size() > 64 * 1024) {
                break;
            }
        }
        stream.close();
        return sink.toString(StandardCharsets.UTF_8.name());
    }
}
