package com.midscene.localagent;

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

    /** One Form row. Keys and placeholders mirror the desktop studio's Form tab. */
    public static final class Field {

        /** How the Form renders the row: masked with a reveal toggle, URL keyboard, … */
        public enum Kind {
            TEXT,
            SECRET,
            URL
        }

        public final String key;
        public final String placeholder;
        public final Kind kind;

        Field(String key, String placeholder, Kind kind) {
            this.key = key;
            this.placeholder = placeholder;
            this.kind = kind;
        }
    }

    public static final List<Field> FIELDS = Collections.unmodifiableList(Arrays.asList(
            new Field(BASE_URL, "https://dashscope.aliyuncs.com/compatible-mode/v1", Field.Kind.URL),
            new Field(API_KEY, "sk-...", Field.Kind.SECRET),
            new Field(MODEL_NAME, "qwen3-vl-plus", Field.Kind.TEXT),
            new Field(MODEL_FAMILY, "qwen3-vl", Field.Kind.TEXT)));

    /**
     * Compatible aliases: the agent resolves these too, so a hand-written `.env` that
     * uses them is complete, and the Form must not claim otherwise.
     */
    private static final List<String> API_KEY_KEYS = Arrays.asList(API_KEY, "OPENAI_API_KEY");
    private static final List<String> BASE_URL_KEYS = Arrays.asList(BASE_URL, "OPENAI_BASE_URL");
    private static final List<String> MODEL_NAME_KEYS =
            Arrays.asList(MODEL_NAME, "MIDSCENE_MODEL", "OPENAI_MODEL");

    /** Shown when no credentials file exists yet: hints, no half-configured keys. */
    public static final String TEMPLATE =
            "# Midscene model credentials, one KEY=VALUE per line.\n"
                    + "# Example (Alibaba DashScope, OpenAI-compatible):\n"
                    + "# MIDSCENE_MODEL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1\n"
                    + "# MIDSCENE_MODEL_API_KEY=sk-...\n"
                    + "# MIDSCENE_MODEL_NAME=qwen3-vl-plus\n"
                    + "# MIDSCENE_MODEL_FAMILY=qwen3-vl\n";

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
     * Keys the agent cannot start without, named as the Form shows them. Model family is
     * deliberately absent: it is optional, and only affects UI localization quality.
     */
    public static List<String> missingKeys(String text) {
        Map<String, String> entries = parse(text).entries;
        List<String> missing = new ArrayList<>(3);
        if (firstSet(entries, API_KEY_KEYS).isEmpty()) {
            missing.add(API_KEY);
        }
        if (firstSet(entries, BASE_URL_KEYS).isEmpty()) {
            missing.add(BASE_URL);
        }
        if (firstSet(entries, MODEL_NAME_KEYS).isEmpty()) {
            missing.add(MODEL_NAME);
        }
        return missing;
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
