package com.midscene.android;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The overlay's copy: one human-readable line per slot.
 *
 * The bar used to print whatever the event happened to carry — the raw `script:` YAML of a
 * yaml task, slug step names like `01-tab-tour-and-input`, lowercase runner states
 * ("acting", "step done") and two unlabelled durations. All of it was accurate and none of
 * it was readable, so the mapping lives here, away from the drawing code, where it can be
 * unit tested.
 */
public final class ProgressText {

    /**
     * Where the words in the progress line come from.
     *
     * This class is pure text shaping with unit tests and no Android types, so the
     * vocabulary is injected: the app installs a resource-backed source
     * ({@code AndroidWords}) so the pill and the notification follow the app language,
     * and everything else — tests, callers without a Context — keeps the English
     * defaults written into the call sites below.
     */
    public interface Words {
        /**
         * @param key      stable name of the slot being filled ("phase.working", …); the
         *                 resource-backed source maps it and ignores the fallback
         * @param fallback the English text, carrying `%s`-style placeholders when it has any
         * @param args     values for those placeholders
         */
        String text(String key, String fallback, Object... args);

        /** A count-sensitive line; `one` and `other` are the English defaults. */
        String quantity(String key, int count, String one, String other);
    }

    private static final Words ENGLISH = new Words() {
        @Override
        public String text(String key, String fallback, Object... args) {
            return args.length == 0 ? fallback : String.format(Locale.US, fallback, args);
        }

        @Override
        public String quantity(String key, int count, String one, String other) {
            return String.format(Locale.US, count == 1 ? one : other, count);
        }
    };

    private static volatile Words words = ENGLISH;

    private ProgressText() {
    }

    /** Install the app's vocabulary; null restores the English defaults. */
    public static void useWords(Words source) {
        words = source == null ? ENGLISH : source;
    }

    private static String w(String key, String fallback, Object... args) {
        return words.text(key, fallback, args);
    }

    private static String q(String key, int count, String one, String other) {
        return words.quantity(key, count, one, other);
    }

    /** YAML flow actions, in the order a yaml task writes them. */
    private static final Pattern SCRIPT_ACTION = Pattern.compile(
            "-\\s*(aiTap|aiInput|aiAssert|aiQuery|aiAct|aiScroll|aiKeyboardPress|sleep|runAdbShell)"
                    + "\\s*:\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\n]*))");

    /** A runner step name that was derived from a prompt: words joined with dashes. */
    private static final Pattern SLUG = Pattern.compile("[a-z0-9]+(?:[-_][a-z0-9]+)+");

    /** The `[HH:mm:ss]` prefix the service log writes. */
    private static final Pattern TIMESTAMP = Pattern.compile("\\d{1,2}:\\d{2}(:\\d{2})?");

    /** The readable field of a param blob: `{"prompt":"…"}`, `{ uri: '…' }`, … */
    private static final Pattern PARAM_TEXT = Pattern.compile(
            "\"?\\b(prompt|description|uri|text|value)\\b\"?\\s*:\\s*(?:\"([^\"]*)\"|'([^']*)')");

    /** `{"timeMs":1200}` — a wait, in the one unit the bar speaks. */
    private static final Pattern PARAM_TIME = Pattern.compile("\"?timeMs\"?\\s*:\\s*(\\d+)");

    /** Locate descriptions run long; the bar keeps the first few words. */
    private static final int ACTION_TARGET_CHARS = 40;

    /**
     * What the run is doing, in sentence case and without runner jargon: `acting` is the
     * aiAct phase and `asserting` the aiAssert one, which mean nothing to a reader.
     */
    public static String phaseLabel(String phase) {
        if (phase == null) {
            return w("phase.working", "Working");
        }
        switch (phase.trim()) {
            case "":
                return w("phase.working", "Working");
            case "starting":
                return w("phase.starting", "Starting");
            case "acting":
                return w("phase.working", "Working");
            case "asserting":
                return w("phase.checking", "Checking");
            case "step done":
                return w("phase.step_done", "Step done");
            case "step failed":
                return w("phase.step_failed", "Step failed");
            case "done":
                return w("phase.done", "Done");
            case "failed":
                return w("phase.failed", "Failed");
            case "stopping":
                // Set when the stop control on the panel is used, before the runner's own
                // "stopped" line arrives: the tap has to look like it did something.
                return w("phase.stopping", "Stopping");
            default:
                // Also carries ready-made sentences ("Starting config…" from the service).
                return sentenceCase(collapse(phase).replace('-', ' ').replace('_', ' '));
        }
    }

    /** "Step 2/5", or nothing when the runner never reported a total. */
    public static String stepChip(int index, int total) {
        String progress = stepProgress(index, total);
        return progress.isEmpty() ? "" : w("progress.step", "Step %s", progress);
    }

    /** "2/5", for places that already say what the numbers are. */
    public static String stepProgress(int index, int total) {
        return total <= 0 ? "" : Math.max(index, 1) + "/" + total;
    }

    /** "Step 4.2s · Total 26s"; either half is dropped when it is not known yet. */
    public static String timings(long stepMillis, long totalMillis) {
        StringBuilder out = new StringBuilder();
        if (stepMillis > 0) {
            out.append(w("timing.step", "Step %s", duration(stepMillis)));
        }
        if (totalMillis > 0) {
            if (out.length() > 0) {
                out.append(" · ");
            }
            out.append(w("timing.total", "Total %s", duration(totalMillis)));
        }
        return out.toString();
    }

    public static String duration(long millis) {
        long seconds = millis / 1000;
        if (seconds < 60) {
            // Sub-ten-second steps are the common case; one decimal tells them apart.
            return millis < 10_000
                    ? String.format(Locale.US, "%.1fs", millis / 1000.0)
                    : seconds + "s";
        }
        return String.format(Locale.US, "%d:%02d", seconds / 60, seconds % 60);
    }

    /**
     * The current step, as a person would say it.
     *
     * Three shapes arrive here: a natural-language prompt (already readable, just needs
     * tidying), a step name the app derived from a prompt (a slug), and — for `yaml` tasks
     * — the whole inner script dumped as YAML, which is summarised into what it will do.
     */
    public static String describe(String prompt) {
        if (prompt == null) {
            return "";
        }
        String text = collapse(prompt);
        if (text.isEmpty()) {
            return "";
        }
        int scriptAt = text.indexOf("script:");
        if (scriptAt >= 0) {
            return describeScript(text.substring(scriptAt));
        }
        if (SLUG.matcher(text).matches()) {
            return sentenceCase(text.replace('-', ' ').replace('_', ' '));
        }
        return sentenceCase(stripQuotes(text));
    }

    /** "Script · 5 actions · first: tap \"Scripts 标签\"" — what a yaml task is about to do. */
    private static String describeScript(String script) {
        Matcher matcher = SCRIPT_ACTION.matcher(script);
        int actions = 0;
        String first = "";
        while (matcher.find()) {
            actions++;
            if (actions == 1) {
                String target = firstNonNull(matcher.group(2), matcher.group(3), matcher.group(4));
                first = target == null || target.trim().isEmpty()
                        ? verb(matcher.group(1))
                        : w("action.target", "%1$s \"%2$s\"", verb(matcher.group(1)),
                                collapse(target).replace("\"", "'"));
            }
        }
        if (actions == 0) {
            return w("script.title", "Script");
        }
        String actionsText = q("script.actions", actions, "%d action", "%d actions");
        return first.isEmpty()
                ? w("script.summary", "Script · %1$s", actionsText)
                : w("script.summary_first", "Script · %1$s · first: %2$s", actionsText, first);
    }

    /** Runner verbs, as the interface calls them. */
    private static String verb(String runnerVerb) {
        switch (runnerVerb) {
            case "aiTap":
                return w("verb.tap", "tap");
            case "aiInput":
                return w("verb.input", "type into");
            case "aiAssert":
                return w("verb.assert", "check");
            case "aiQuery":
                return w("verb.query", "read");
            case "aiAct":
                return w("verb.act", "act on");
            case "aiScroll":
                return w("verb.scroll", "scroll");
            case "aiKeyboardPress":
                return w("verb.keyboard_press", "press keys");
            case "sleep":
                return w("verb.sleep", "wait");
            case "runAdbShell":
                return w("verb.shell", "run a shell command");
            default:
                return runnerVerb;
        }
    }

    /** Device-action verbs, as the agent reports them ("Tap", "Input", "Sleep"). */
    private static String actionVerb(String type) {
        switch (type) {
            case "Tap":
                return w("action.tap", "Tap");
            case "DoubleTap":
                return w("action.double_tap", "Double tap");
            case "LongPress":
                return w("action.long_press", "Long press");
            case "Input":
                return w("action.input", "Type");
            case "KeyboardPress":
                return w("action.keyboard_press", "Press");
            case "Scroll":
                return w("action.scroll", "Scroll");
            case "Swipe":
                return w("action.swipe", "Swipe");
            case "Pinch":
                return w("action.pinch", "Pinch");
            case "Hover":
                return w("action.hover", "Hover");
            case "Sleep":
                return w("action.sleep", "Wait");
            case "Back":
                return w("action.back", "Back");
            case "Home":
                return w("action.home", "Home");
            case "Launch":
                return w("action.launch", "Open");
            case "RunAdbShell":
                return w("action.shell", "Run a shell command");
            default:
                return type;
        }
    }

    /**
     * One device action, as a person would say it: the agent reports "Tap - Wi-Fi" and
     * the bar has a single line to spare.
     *
     * The tips arrive in three shapes, all of them real: clean text for a script's
     * steps ("Tap - Scripts 标签"), a JSON-ish param for an AI-planned action
     * (`Tap - {"prompt":"Settings app icon…","locatedPixelResult":{…}}`), and an input
     * that appends what it typed after a second dash. Everything here is about getting
     * one short, human line out of that.
     */
    public static String actionLabel(String tip) {
        String text = collapse(tip);
        if (text.isEmpty()) {
            return "";
        }
        int dash = text.indexOf(" - ");
        if (dash <= 0) {
            return sentenceCase(text);
        }
        String verb = actionVerb(text.substring(0, dash).trim());
        String rest = text.substring(dash + 3).trim();
        // "Input - <field description> - <the text>" — what was typed is the useful half.
        int lastDash = rest.lastIndexOf(" - ");
        if (lastDash > 0 && ("Type".equals(verb) || "Input".equals(verb))) {
            rest = rest.substring(lastDash + 3).trim();
        }
        String target = shorten(stripQuotes(friendlyTarget(rest)));
        if (target.isEmpty()) {
            return verb;
        }
        if ("Wait".equals(verb) && target.matches("\\d+")) {
            return w("action.wait", "%1$s %2$s", verb, duration(Long.parseLong(target)));
        }
        return w("action.target", "%1$s \"%2$s\"", verb, target);
    }

    /**
     * Pull the readable part out of a param blob, or drop it: a wall of JSON in the bar
     * is worse than the verb on its own.
     */
    private static String friendlyTarget(String target) {
        if (!target.startsWith("{")) {
            return target;
        }
        Matcher human = PARAM_TEXT.matcher(target);
        if (human.find()) {
            return human.group(human.group(2) != null ? 2 : 3);
        }
        Matcher sleep = PARAM_TIME.matcher(target);
        if (sleep.find()) {
            return sleep.group(1);
        }
        return "";
    }

    /** Long locate descriptions are the point of the config, not of the bar. */
    private static String shorten(String target) {
        return target.length() <= ACTION_TARGET_CHARS
                ? target
                : target.substring(0, ACTION_TARGET_CHARS).trim() + "…";
    }

    /**
     * The step line: the live action while a script runs, the user's own instruction
     * otherwise.
     *
     * A script step's "prompt" is its YAML dump, so the action the agent just started is
     * both shorter and more informative than a summary of the whole script.
     */
    public static String describeStep(String prompt, String actionTip) {
        String action = actionLabel(actionTip);
        boolean script = prompt != null && prompt.contains("script:");
        String text = describe(prompt);
        if (script) {
            // Until the first action arrives, say what the script is about to do.
            return action.isEmpty() ? text : action;
        }
        return text.isEmpty() ? action : text;
    }

    /** Notification title: state and progress, nothing else ("Working · 2/5"). */
    public static String notificationTitle(String label, String progress) {
        String state = collapse(label);
        String numbers = collapse(progress);
        if (numbers.isEmpty()) {
            return state;
        }
        return state.isEmpty() ? numbers : state + " · " + numbers;
    }

    /** Notification line: what is happening now, and how long this step has taken. */
    public static String notificationText(String detail, long stepMillis) {
        String text = collapse(detail);
        String clock = stepMillis > 0 ? duration(stepMillis) : "";
        if (text.isEmpty()) {
            return clock;
        }
        return clock.isEmpty() ? text : text + " · " + clock;
    }

    /**
     * One terse line for a raw log line: the most informative tail of it, in sentence
     * case. Structured event lines fall back to `fallback` (the caller's last good text)
     * instead of echoing JSON at the user.
     */
    public static String summarize(String line, String fallback) {
        String previous = fallback == null ? "" : fallback;
        if (line == null) {
            return previous;
        }
        String text = collapse(line);
        if (text.isEmpty() || text.startsWith("{") || text.startsWith("}")
                || text.contains("\"event\":") || text.startsWith("===")) {
            return previous;
        }
        if (text.startsWith("[task] running")) {
            return sentenceCase(w("log.running", "Running %s",
                    text.substring("[task] running".length()).trim()));
        }
        if (text.startsWith("[")) {
            int close = text.indexOf(']');
            if (close > 0 && close < 40) {
                String head = text.substring(1, close);
                // "[provision] failed: …" carries meaning in the brackets; a service-log
                // timestamp does not, and reading "00:12:37 exit code 0" helps nobody.
                text = collapse((TIMESTAMP.matcher(head).matches() ? "" : head + " ")
                        + text.substring(close + 1));
            }
        }
        if (SLUG.matcher(text).matches()) {
            return sentenceCase(text.replace('-', ' ').replace('_', ' '));
        }
        return sentenceCase(text);
    }

    private static String firstNonNull(String... values) {
        for (String value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static String stripQuotes(String value) {
        String text = value.trim();
        if (text.length() >= 2
                && ((text.startsWith("\"") && text.endsWith("\""))
                || (text.startsWith("'") && text.endsWith("'")))) {
            return text.substring(1, text.length() - 1).trim();
        }
        return text;
    }

    /** One line, no runs of whitespace: the bar has a single row per slot. */
    private static String collapse(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    /** Capitalise the first letter, so states and log tails read alike. */
    private static String sentenceCase(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        char first = value.charAt(0);
        if (!Character.isLetter(first) || Character.isUpperCase(first)) {
            return value;
        }
        // "model.env: injecting 4 variables" opens with a file name, not a sentence.
        int space = value.indexOf(' ');
        String head = space < 0 ? value : value.substring(0, space);
        if (head.indexOf('.') >= 0 || head.indexOf('_') >= 0) {
            return value;
        }
        return Character.toUpperCase(first) + value.substring(1);
    }
}
