package com.midscene.android;

import android.content.Context;
import android.content.res.Resources;

import java.util.Locale;

/**
 * The translated vocabulary behind {@link ProgressText}.
 *
 * The text shaper carries the English copy at its call sites and asks this class to
 * replace it; a key with no translation (a slot added to ProgressText before the
 * resource exists) keeps the English fallback, so the progress pill never goes blank.
 * Count-sensitive lines map to `plurals`, and everything else to `strings_runtime.xml`.
 */
final class AndroidWords implements ProgressText.Words {

    private final Resources resources;

    private AndroidWords(Resources resources) {
        this.resources = resources;
    }

    /** Point the progress copy at the language this app is running in. */
    static void install(Context context) {
        ProgressText.useWords(new AndroidWords(context.getApplicationContext().getResources()));
    }

    @Override
    public String text(String key, String fallback, Object... args) {
        int id = stringId(key);
        if (id == 0) {
            return args.length == 0 ? fallback : String.format(Locale.US, fallback, args);
        }
        return args.length == 0 ? resources.getString(id) : resources.getString(id, args);
    }

    @Override
    public String quantity(String key, int count, String one, String other) {
        int id = pluralsId(key);
        if (id == 0) {
            return String.format(Locale.US, count == 1 ? one : other, count);
        }
        return resources.getQuantityString(id, count, count);
    }

    private static int stringId(String key) {
        switch (key) {
            case "phase.working":
                return R.string.progress_phase_working;
            case "phase.starting":
                return R.string.progress_phase_starting;
            case "phase.checking":
                return R.string.progress_phase_checking;
            case "phase.step_done":
                return R.string.progress_phase_step_done;
            case "phase.step_failed":
                return R.string.progress_phase_step_failed;
            case "phase.done":
                return R.string.progress_phase_done;
            case "phase.failed":
                return R.string.progress_phase_failed;
            case "progress.step":
                return R.string.progress_step;
            case "timing.step":
                return R.string.progress_timing_step;
            case "timing.total":
                return R.string.progress_timing_total;
            case "script.title":
                return R.string.progress_script;
            case "script.summary":
                return R.string.progress_script_summary;
            case "script.summary_first":
                return R.string.progress_script_summary_first;
            case "verb.tap":
                return R.string.progress_verb_tap;
            case "verb.input":
                return R.string.progress_verb_input;
            case "verb.assert":
                return R.string.progress_verb_assert;
            case "verb.query":
                return R.string.progress_verb_query;
            case "verb.act":
                return R.string.progress_verb_act;
            case "verb.scroll":
                return R.string.progress_verb_scroll;
            case "verb.keyboard_press":
                return R.string.progress_verb_keyboard_press;
            case "verb.sleep":
                return R.string.progress_verb_sleep;
            case "verb.shell":
                return R.string.progress_verb_shell;
            case "action.tap":
                return R.string.progress_action_tap;
            case "action.double_tap":
                return R.string.progress_action_double_tap;
            case "action.long_press":
                return R.string.progress_action_long_press;
            case "action.input":
                return R.string.progress_action_input;
            case "action.keyboard_press":
                return R.string.progress_action_keyboard_press;
            case "action.scroll":
                return R.string.progress_action_scroll;
            case "action.swipe":
                return R.string.progress_action_swipe;
            case "action.pinch":
                return R.string.progress_action_pinch;
            case "action.hover":
                return R.string.progress_action_hover;
            case "action.sleep":
                return R.string.progress_action_sleep;
            case "action.back":
                return R.string.progress_action_back;
            case "action.home":
                return R.string.progress_action_home;
            case "action.launch":
                return R.string.progress_action_launch;
            case "action.shell":
                return R.string.progress_action_shell;
            case "action.target":
                return R.string.progress_action_target;
            case "action.wait":
                return R.string.progress_action_wait;
            case "log.running":
                return R.string.progress_log_running;
            default:
                return 0;
        }
    }

    private static int pluralsId(String key) {
        switch (key) {
            case "script.actions":
                return R.plurals.progress_script_actions;
            default:
                return 0;
        }
    }
}
