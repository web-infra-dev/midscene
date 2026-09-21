package com.midscene.android;

import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * The connection test, driven against a real socket.
 *
 * What it guards is the part a user acts on: the request has to be an OpenAI-compatible
 * chat completion carrying an image, it has to reach the path the agent's own client would
 * call, and a refusal has to come back classified — a rejected key, a missing model, an
 * address with nothing behind it — with the service's own sentence kept for the screen.
 */
public class ModelConnectionTestTest {

    @Test
    public void aWorkingEndpointIsReportedWithTheModelsReply() throws Exception {
        try (StubModel stub = StubModel.start(200,
                "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"red\"}}]}")) {
            ModelConnectionTest.Result result =
                    ModelConnectionTest.run(connection(stub.baseUrl() + "/v1"));

            assertTrue(result.detail, result.ok);
            assertEquals(200, result.httpStatus);
            assertEquals("red", result.detail);

            String request = stub.awaitRequest();
            // The image is the point: a text-only model has to fail here, at the first
            // task, rather than pass a form that only ever sent text.
            assertTrue(request, request.contains("\"type\":\"image_url\""));
            assertTrue(request, request.contains(ModelConnectionTest.PROBE_IMAGE));
            assertTrue(request, request.contains("\"model\":\"test-model\""));
            assertEquals("Bearer sk-test", stub.authorization());
            assertEquals("/v1/chat/completions", stub.path());
        }
    }

    @Test
    public void aBaseUrlThatAlreadyNamesThePathIsNotAppendedTwice() throws Exception {
        try (StubModel stub = StubModel.start(200,
                "{\"choices\":[{\"message\":{\"content\":\"red\"}}]}")) {
            ModelConnectionTest.Result result =
                    ModelConnectionTest.run(connection(stub.baseUrl() + "/v1/chat/completions"));

            assertTrue(result.detail, result.ok);
            assertEquals("/v1/chat/completions", stub.path());
        }
    }

    /**
     * A refusal is only useful if it says which refusal it was, with the service's sentence
     * kept: that sentence names the key or the model to fix, and it is the difference
     * between "it did not work" and "your model name is wrong".
     */
    @Test
    public void refusalsAreClassifiedAndKeepTheServicesOwnWords() {
        ModelConnectionTest.Result rejectedKey = ModelConnectionTest.interpret(401,
                "{\"error\":{\"message\":\"Invalid API key provided: sk-test\"}}", 12);
        assertEquals(ModelConnectionTest.Failure.AUTH, rejectedKey.failure);
        assertEquals(401, rejectedKey.httpStatus);
        assertTrue(rejectedKey.detail, rejectedKey.detail.contains("Invalid API key provided"));

        ModelConnectionTest.Result noModel = ModelConnectionTest.interpret(404,
                "{\"error\":{\"message\":\"The model `test-model` does not exist\"}}", 12);
        assertEquals(ModelConnectionTest.Failure.NOT_FOUND, noModel.failure);
        assertTrue(noModel.detail, noModel.detail.contains("does not exist"));

        ModelConnectionTest.Result badRequest = ModelConnectionTest.interpret(400,
                "{\"message\":\"max_tokens is not supported\"}", 12);
        assertEquals(ModelConnectionTest.Failure.BAD_REQUEST, badRequest.failure);
        assertTrue(badRequest.detail, badRequest.detail.contains("max_tokens"));

        ModelConnectionTest.Result server = ModelConnectionTest.interpret(503,
                "<html>maintenance</html>", 12);
        assertEquals(ModelConnectionTest.Failure.HTTP, server.failure);
        assertEquals(503, server.httpStatus);
        assertTrue(server.detail, server.detail.contains("maintenance"));
    }

    /** A 2xx that is not a chat completion is a failure, whatever the status says. */
    @Test
    public void aSuccessfulStatusWithoutChoicesIsAFailure() {
        ModelConnectionTest.Result result = ModelConnectionTest.interpret(200,
                "{\"object\":\"list\",\"data\":[]}", 5);
        assertFalse(result.ok);
        assertEquals(ModelConnectionTest.Failure.EMPTY_REPLY, result.failure);
    }

    @Test
    public void anAddressWithNothingListeningIsANetworkFailure() throws Exception {
        // A port that was just free: no route, no server — the "wrong address" path.
        int port;
        try (ServerSocket free = new ServerSocket(0, 0, InetAddress.getByName("127.0.0.1"))) {
            port = free.getLocalPort();
        }

        ModelConnectionTest.Result result =
                ModelConnectionTest.run(connection("http://127.0.0.1:" + port + "/v1"));

        assertFalse(result.ok);
        assertEquals(0, result.httpStatus);
        assertEquals(ModelConnectionTest.Failure.NETWORK, result.failure);
        assertNotNull(result.detail);
    }

    @Test
    public void anEmptyReplyIsAFailureNotAConnection() throws Exception {
        try (StubModel stub = StubModel.start(200,
                "{\"choices\":[{\"message\":{\"content\":\"\"}}]}")) {
            ModelConnectionTest.Result result =
                    ModelConnectionTest.run(connection(stub.baseUrl() + "/v1"));

            assertFalse(result.ok);
            assertEquals(200, result.httpStatus);
            assertEquals(ModelConnectionTest.Failure.EMPTY_REPLY, result.failure);
        }
    }

    @Test
    public void somethingThatIsNotAChatCompletionIsReportedAsSuch() throws Exception {
        try (StubModel stub = StubModel.start(200, "<html>gateway</html>")) {
            ModelConnectionTest.Result result =
                    ModelConnectionTest.run(connection(stub.baseUrl() + "/v1"));

            assertFalse(result.ok);
            assertEquals(ModelConnectionTest.Failure.BODY, result.failure);
            assertTrue(result.detail, result.detail.contains("gateway"));
        }
    }

    @Test
    public void anIncompleteConfigurationIsNotSentAnywhere() {
        ModelConnectionTest.Result result = ModelConnectionTest.run(
                ModelEnvFile.connection("MIDSCENE_MODEL_NAME=test-model\n"));

        assertFalse(result.ok);
        assertEquals(0, result.httpStatus);
        assertEquals(ModelConnectionTest.Failure.INCOMPLETE, result.failure);
    }

    @Test
    public void theEndpointIsBuiltTheWayTheAgentBuildsIt() {
        assertEquals("https://host/v1/chat/completions",
                ModelConnectionTest.completionUrl("https://host/v1"));
        assertEquals("https://host/v1/chat/completions",
                ModelConnectionTest.completionUrl(" https://host/v1/ "));
        assertEquals("https://host/chat/completions",
                ModelConnectionTest.completionUrl("https://host"));
        assertEquals("https://host/v1/chat/completions",
                ModelConnectionTest.completionUrl("https://host/v1/chat/completions"));
        assertEquals("", ModelConnectionTest.completionUrl("   "));
    }

    @Test
    public void aliasesResolveTheSameWayTheRunGateDoes() {
        ModelEnvFile.Connection connection = ModelEnvFile.connection(
                "OPENAI_API_KEY=sk-x\nOPENAI_BASE_URL=https://host/v1\nOPENAI_MODEL=gpt\n"
                        + "MIDSCENE_MODEL_FAMILY=gemini\n");

        assertTrue(connection.complete());
        assertEquals("sk-x", connection.apiKey);
        assertEquals("https://host/v1", connection.baseUrl);
        assertEquals("gpt", connection.model);
        assertEquals("gemini", connection.family);
    }

    private static ModelEnvFile.Connection connection(String baseUrl) {
        return ModelEnvFile.connection(
                "MIDSCENE_MODEL_API_KEY=sk-test\nMIDSCENE_MODEL_BASE_URL=" + baseUrl + "\n"
                        + "MIDSCENE_MODEL_NAME=test-model\nMIDSCENE_MODEL_FAMILY=gemini\n");
    }

    /**
     * One HTTP response, written by hand.
     *
     * A real socket rather than a mocked client: what is being tested is the request that
     * goes out and the answer that comes back, and driving `HttpURLConnection` needs
     * something on the other end of a port. Exactly one connection is served, which is
     * exactly how many a test makes.
     */
    private static final class StubModel implements AutoCloseable {

        private final ServerSocket socket;
        private final CountDownLatch served = new CountDownLatch(1);
        private final AtomicReference<String> request = new AtomicReference<>("");

        private StubModel(int status, String body) throws IOException {
            socket = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
            Thread thread = new Thread(() -> serve(status, body), "stub-model-endpoint");
            thread.setDaemon(true);
            thread.start();
        }

        static StubModel start(int status, String body) throws IOException {
            return new StubModel(status, body);
        }

        String baseUrl() {
            return "http://127.0.0.1:" + socket.getLocalPort();
        }

        String awaitRequest() throws InterruptedException {
            assertTrue("the client never sent a request", served.await(5, TimeUnit.SECONDS));
            return request.get();
        }

        /** The path of the request line, e.g. {@code /v1/chat/completions}. */
        String path() throws InterruptedException {
            String[] parts = awaitRequest().split("\r\n")[0].split(" ");
            return parts.length > 1 ? parts[1] : "";
        }

        String authorization() throws InterruptedException {
            for (String line : awaitRequest().split("\r\n")) {
                int colon = line.indexOf(':');
                if (colon > 0 && line.substring(0, colon).equalsIgnoreCase("Authorization")) {
                    return line.substring(colon + 1).trim();
                }
            }
            return "";
        }

        private void serve(int status, String body) {
            try (Socket client = socket.accept()) {
                request.set(readRequest(client.getInputStream()));
                byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                String head = "HTTP/1.1 " + status + " Stub\r\n"
                        + "Content-Type: application/json\r\n"
                        + "Content-Length: " + payload.length + "\r\n"
                        + "Connection: close\r\n\r\n";
                OutputStream out = client.getOutputStream();
                out.write(head.getBytes(StandardCharsets.US_ASCII));
                out.write(payload);
                out.flush();
            } catch (IOException ignored) {
                // The test failed before it could read the answer; its assertions say so.
            } finally {
                served.countDown();
            }
        }

        /** Headers plus the body, read to the length the headers declare. */
        private static String readRequest(InputStream stream) throws IOException {
            ByteArrayOutputStream head = new ByteArrayOutputStream();
            int matched = 0;
            int value;
            while (matched < 4 && (value = stream.read()) >= 0) {
                head.write(value);
                matched = switch (value) {
                    case '\r', '\n' -> matched + 1;
                    default -> 0;
                };
            }
            String headerText = head.toString(StandardCharsets.US_ASCII.name());
            int length = 0;
            for (String line : headerText.split("\r\n")) {
                if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) {
                    length = Integer.parseInt(line.substring(line.indexOf(':') + 1).trim());
                }
            }
            byte[] body = new byte[length];
            int read = 0;
            while (read < length) {
                int count = stream.read(body, read, length - read);
                if (count < 0) {
                    break;
                }
                read += count;
            }
            return headerText + new String(body, 0, read, StandardCharsets.UTF_8);
        }

        @Override
        public void close() throws IOException {
            socket.close();
        }
    }
}
