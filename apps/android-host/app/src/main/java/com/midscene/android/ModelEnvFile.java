package com.midscene.android;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The model-credentials file (`filesDir/model.env`).
 *
 * The same text has two readers: this app injects the values into the agent process,
 * and Settings edits them (Form or `.env` style). Both go through this class, so what
 * the screen shows is what the agent receives — two parsers is how "saved" and "in
 * effect" drift apart.
 *
 * The rules follow the desktop studio's env editor: `KEY=VALUE` lines, `#` comments, a
 * value containing whitespace, quotes, `#` or `=` is quoted, and an empty value removes
 * the key instead of leaving a half-written `KEY=` line behind. Parsing stays forgiving
 * (CRLF, `export `, `KEY: VALUE`, surrounding quotes) because hand-written files arrive
 * in those shapes, and a silently dropped line used to surface much later as
 * "Invalid URL".
 */
public final class ModelEnvFile {

    private ModelEnvFile() {
    }

    public static final String API_KEY = "MIDSCENE_MODEL_API_KEY";
    public static final String BASE_URL = "MIDSCENE_MODEL_BASE_URL";
    public static final String MODEL_NAME = "MIDSCENE_MODEL_NAME";
    public static final String MODEL_FAMILY = "MIDSCENE_MODEL_FAMILY";

    /**
     * One Form row: the keys and their order mirror the desktop studio's Form tab, with
     * the app's own wording rather than a vendor's sample values.
     */
    public static final class Field {

        /** How the Form renders the row: masked with a reveal toggle, URL keyboard, … */
        public enum Kind {
            TEXT,
            SECRET,
            URL,
            /** A value from a fixed list, picked rather than typed. */
            CHOICE
        }

        public final String key;
        public final String placeholder;
        public final Kind kind;
        /** What a {@link Kind#CHOICE} row accepts; empty for every other kind. */
        public final List<String> choices;

        Field(String key, String placeholder, Kind kind) {
            this(key, placeholder, kind, Collections.emptyList());
        }

        Field(String key, String placeholder, Kind kind, List<String> choices) {
            this.key = key;
            this.placeholder = placeholder;
            this.kind = kind;
            this.choices = Collections.unmodifiableList(new ArrayList<>(choices));
        }
    }

    /**
     * The model families the agent accepts, in the order its own list uses.
     *
     * A copy of `MODEL_FAMILY_VALUES` in `packages/shared/src/env/types.ts`, because the
     * value is matched verbatim: a picker that offers a name the agent does not know turns
     * into a failed run instead of a config error, and a typed near-miss ("qwen3vl") is
     * accepted by the form and rejected by the agent. {@code ModelFamilySyncTest} compares
     * this list against that file, so a family added or renamed there fails here.
     */
    public static final List<String> FAMILY_VALUES = Collections.unmodifiableList(Arrays.asList(
            "doubao-vision",
            "doubao-seed",
            "gemini",
            "qwen2.5-vl",
            "qwen3-vl",
            "qwen3",
            "qwen3.5",
            "qwen3.6",
            "vlm-ui-tars",
            "vlm-ui-tars-doubao",
            "vlm-ui-tars-doubao-1.5",
            "glm-v",
            "auto-glm",
            "auto-glm-multilingual",
            "gpt-5",
            "gpt-6",
            "deepseek",
            "kimi",
            "kimi3",
            "xiaomi-mimo"));

    /**
     * The Form's rows, in the studio's order. The placeholders describe what the row
     * wants: a real endpoint or model name reads as "this is what you are supposed to
     * use", and every OpenAI-compatible service is equally valid.
     */
    public static final List<Field> FIELDS = Collections.unmodifiableList(Arrays.asList(
            new Field(BASE_URL, "OpenAI-compatible endpoint, usually ending in /v1", Field.Kind.URL),
            new Field(API_KEY, "The API key your model service issued", Field.Kind.SECRET),
            new Field(MODEL_NAME, "Model name, exactly as your service lists it", Field.Kind.TEXT),
            new Field(MODEL_FAMILY, "The family your model belongs to", Field.Kind.CHOICE,
                    FAMILY_VALUES)));

    /**
     * Compatible aliases: the agent resolves these too, so a hand-written `.env` that
     * uses them is complete, and the Form must not claim otherwise.
     */
    private static final List<String> API_KEY_KEYS = Arrays.asList(API_KEY, "OPENAI_API_KEY");
    private static final List<String> BASE_URL_KEYS = Arrays.asList(BASE_URL, "OPENAI_BASE_URL");
    private static final List<String> MODEL_NAME_KEYS =
            Arrays.asList(MODEL_NAME, "MIDSCENE_MODEL", "OPENAI_MODEL");
    /** No alias exists for the family: the agent reads this key alone. */
    private static final List<String> MODEL_FAMILY_KEYS = Collections.singletonList(MODEL_FAMILY);

    /**
     * Shown when no credentials file exists yet: what each key wants, with no half-configured
     * keys and no single vendor's endpoint — the endpoint, key and model name come from
     * whichever OpenAI-compatible service the user has an account with, and the family says
     * which UI-localisation strategy that model needs.
     */
    public static final String TEMPLATE =
            "# Midscene model credentials, one KEY=VALUE per line.\n"
                    + "# Any OpenAI-compatible vision model works. The endpoint, key and model\n"
                    + "# name come from your model service; the family tells Midscene how to ask\n"
                    + "# that model for element locations. Uncomment these lines and fill them in:\n"
                    + "# MIDSCENE_MODEL_BASE_URL=<endpoint URL, usually ending in /v1>\n"
                    + "# MIDSCENE_MODEL_API_KEY=<API key issued by that service>\n"
                    + "# MIDSCENE_MODEL_NAME=<model name, as the service lists it>\n"
                    + "# MIDSCENE_MODEL_FAMILY=<one family the agent knows, e.g. qwen3-vl, gemini>\n";

    /** Parsed file: every usable pair, plus what had to be ignored. */
    public static final class Content {
        /** Key to value, in file order; a repeated key keeps its last value. */
        public final Map<String, String> entries;
        /** Lines with no `KEY=VALUE` shape at all. */
        public final int unreadableLines;
        /** Lines whose key is not a usable environment variable name. */
        public final int invalidKeyLines;

        Content(Map<String, String> entries, int unreadableLines, int invalidKeyLines) {
            this.entries = Collections.unmodifiableMap(entries);
            this.unreadableLines = unreadableLines;
            this.invalidKeyLines = invalidKeyLines;
        }

        public boolean isEmpty() {
            return entries.isEmpty();
        }
    }

    public static Content parse(String text) {
        Map<String, String> entries = new LinkedHashMap<>();
        int unreadable = 0;
        int invalidKeys = 0;

        for (String rawLine : text.split("\r?\n")) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#") || line.startsWith("//")) {
                continue;
            }
            if (line.startsWith("export ")) {
                line = line.substring("export ".length()).trim();
            }

            int separator = line.indexOf('=');
            if (separator < 0) {
                separator = line.indexOf(':');
            }
            if (separator <= 0) {
                unreadable++;
                continue;
            }

            String key = line.substring(0, separator).trim();
            if (!isKey(key)) {
                invalidKeys++;
                continue;
            }
            entries.put(key, unquote(line.substring(separator + 1).trim()));
        }

        return new Content(entries, unreadable, invalidKeys);
    }

    /** The value the agent would use for `key`, or "" when the file does not set it. */
    public static String value(String text, String key) {
        return parse(text).entries.getOrDefault(key, "");
    }

    /**
     * Return `text` with `key` set to `value`, keeping every other line exactly as it
     * was (comments, unknown keys, blank lines). An empty value removes the key. A key
     * written twice collapses into the single edited line, so one key means one value.
     */
    public static String setValue(String text, String key, String value) {
        if (!isKey(key)) {
            throw new IllegalArgumentException("not an environment variable name: " + key);
        }
        List<String> lines = new ArrayList<>(Arrays.asList(text.split("\r?\n", -1)));
        String replacement = value.isEmpty() ? null : key + "=" + quoteIfNeeded(value);

        int lastMatch = -1;
        for (int index = 0; index < lines.size(); index++) {
            if (key.equals(keyOf(lines.get(index)))) {
                lastMatch = index;
            }
        }

        List<String> result = new ArrayList<>(lines.size() + 1);
        for (int index = 0; index < lines.size(); index++) {
            if (key.equals(keyOf(lines.get(index)))) {
                if (index == lastMatch && replacement != null) {
                    result.add(replacement);
                }
                continue;
            }
            result.add(lines.get(index));
        }
        if (lastMatch < 0 && replacement != null) {
            int insertAt = result.size();
            while (insertAt > 0 && result.get(insertAt - 1).trim().isEmpty()) {
                insertAt--;
            }
            result.add(insertAt, replacement);
        }
        return String.join("\n", result);
    }

    /**
     * Apply every pair of a pasted `.env` block onto `text`, leaving keys the pasted
     * text does not mention exactly as they were. Used by the Form style, where a paste
     * should fill the fields instead of replacing text the user cannot see.
     */
    public static String merge(String text, String pasted) {
        String merged = text;
        for (Map.Entry<String, String> entry : parse(pasted).entries.entrySet()) {
            merged = setValue(merged, entry.getKey(), entry.getValue());
        }
        return merged;
    }

    /**
     * Keys the agent cannot work without, named as the Form shows them.
     *
     * Model family counts: without it the agent cannot tell which UI-localisation strategy
     * the model needs, says so on every run, and falls back to asking for coordinates the
     * model may not produce. It is a required answer with a fixed set of values, which is
     * why the Form picks it instead of accepting typed text.
     */
    public static List<String> missingKeys(String text) {
        Map<String, String> entries = parse(text).entries;
        List<String> missing = new ArrayList<>(4);
        if (firstSet(entries, API_KEY_KEYS).isEmpty()) {
            missing.add(API_KEY);
        }
        if (firstSet(entries, BASE_URL_KEYS).isEmpty()) {
            missing.add(BASE_URL);
        }
        if (firstSet(entries, MODEL_NAME_KEYS).isEmpty()) {
            missing.add(MODEL_NAME);
        }
        if (firstSet(entries, MODEL_FAMILY_KEYS).isEmpty()) {
            missing.add(MODEL_FAMILY);
        }
        return missing;
    }

    /**
     * The connection the agent would build from this file, with the compatible aliases
     * resolved — what a live request has to use, and what the connection test sends.
     */
    public static final class Connection {
        public final String apiKey;
        public final String baseUrl;
        public final String model;
        public final String family;

        Connection(String apiKey, String baseUrl, String model, String family) {
            this.apiKey = apiKey;
            this.baseUrl = baseUrl;
            this.model = model;
            this.family = family;
        }

        public boolean complete() {
            return !apiKey.isEmpty() && !baseUrl.isEmpty() && !model.isEmpty()
                    && !family.isEmpty();
        }
    }

    public static Connection connection(String text) {
        Map<String, String> entries = parse(text).entries;
        return new Connection(
                firstSet(entries, API_KEY_KEYS),
                firstSet(entries, BASE_URL_KEYS),
                firstSet(entries, MODEL_NAME_KEYS),
                firstSet(entries, MODEL_FAMILY_KEYS));
    }

    /** Quote only when the value would otherwise not survive a round trip. */
    public static String quoteIfNeeded(String value) {
        if (value.isEmpty()) {
            return "";
        }
        if (!needsQuotes(value)) {
            return value;
        }
        StringBuilder quoted = new StringBuilder(value.length() + 2).append('"');
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '\\':
                    quoted.append("\\\\");
                    break;
                case '"':
                    quoted.append("\\\"");
                    break;
                case '\n':
                    quoted.append("\\n");
                    break;
                case '\r':
                    quoted.append("\\r");
                    break;
                case '\t':
                    quoted.append("\\t");
                    break;
                default:
                    quoted.append(character);
            }
        }
        return quoted.append('"').toString();
    }

    private static boolean needsQuotes(String value) {
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (Character.isWhitespace(character)
                    || character == '"'
                    || character == '\''
                    || character == '#'
                    || character == '=') {
                return true;
            }
        }
        return false;
    }

    private static String unquote(String value) {
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            return unescapeDoubleQuoted(value.substring(1, value.length() - 1));
        }
        if (value.length() >= 2 && value.startsWith("'") && value.endsWith("'")) {
            return value.substring(1, value.length() - 1)
                    .replace("\\'", "'")
                    .replace("\\\\", "\\");
        }
        return value;
    }

    private static String unescapeDoubleQuoted(String value) {
        StringBuilder result = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character != '\\' || index + 1 >= value.length()) {
                result.append(character);
                continue;
            }
            char escaped = value.charAt(++index);
            switch (escaped) {
                case 'n':
                    result.append('\n');
                    break;
                case 'r':
                    result.append('\r');
                    break;
                case 't':
                    result.append('\t');
                    break;
                case '"':
                    result.append('"');
                    break;
                case '\\':
                    result.append('\\');
                    break;
                default:
                    // Unknown escape: keep it verbatim rather than dropping characters.
                    result.append('\\').append(escaped);
            }
        }
        return result.toString();
    }

    /** The key of one line, or null when the line does not define one. */
    private static String keyOf(String line) {
        String trimmed = line.trim();
        if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("//")) {
            return null;
        }
        if (trimmed.startsWith("export ")) {
            trimmed = trimmed.substring("export ".length()).trim();
        }
        int separator = trimmed.indexOf('=');
        if (separator < 0) {
            separator = trimmed.indexOf(':');
        }
        if (separator <= 0) {
            return null;
        }
        String key = trimmed.substring(0, separator).trim();
        return isKey(key) ? key : null;
    }

    private static boolean isKey(String key) {
        return key.matches("[A-Za-z_][A-Za-z0-9_]*");
    }

    private static String firstSet(Map<String, String> entries, List<String> keys) {
        for (String key : keys) {
            String value = entries.get(key);
            if (value != null && !value.trim().isEmpty()) {
                return value.trim();
            }
        }
        return "";
    }
}
