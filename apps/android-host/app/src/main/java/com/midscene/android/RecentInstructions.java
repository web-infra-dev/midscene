package com.midscene.android;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The instructions this user has run, most recent first.
 *
 * The Run page offers them back with a per-row popover, because the useful action on
 * something you already ran is "do that again" — History answers what happened, this
 * answers what to run next.
 *
 * Stored as a JSON array, which is a change from the newline-joined text older builds
 * wrote: an instruction is free to be several lines (the input is a multi-line field),
 * and that form split one instruction into two rows. [decode] still reads the old text
 * so an upgrade keeps the list it had.
 */
final class RecentInstructions {

    /** How many instructions the Run page keeps offering. */
    static final int MAX = 8;

    private RecentInstructions() {
    }

    /** Read a stored list: a JSON array, or the newline-joined form older builds wrote. */
    static List<String> decode(String stored) {
        if (stored == null || stored.trim().isEmpty()) {
            return Collections.emptyList();
        }
        String text = stored.trim();
        if (text.startsWith("[")) {
            try {
                JSONArray array = new JSONArray(text);
                List<String> items = new ArrayList<>(array.length());
                for (int index = 0; index < array.length(); index += 1) {
                    addUnique(items, array.optString(index, ""));
                }
                return items;
            } catch (JSONException error) {
                // A hand-edited preference should still show something rather than
                // throwing away every row it holds.
            }
        }
        List<String> items = new ArrayList<>();
        for (String line : text.split("\n")) {
            addUnique(items, line);
        }
        return items;
    }

    /** The storable form of a list: trimmed to {@link #MAX}, blanks and repeats gone. */
    static String encode(List<String> recent) {
        JSONArray array = new JSONArray();
        if (recent != null) {
            for (String item : recent) {
                if (array.length() >= MAX) {
                    break;
                }
                if (usable(item) && !contains(array, item)) {
                    array.put(item);
                }
            }
        }
        return array.toString();
    }

    /** [prompt] first, without duplicates, capped: one instruction means one row. */
    static List<String> add(List<String> recent, String prompt) {
        List<String> items = new ArrayList<>();
        if (usable(prompt)) {
            items.add(prompt);
        }
        if (recent != null) {
            for (String item : recent) {
                if (usable(item) && !items.contains(item) && items.size() < MAX) {
                    items.add(item);
                }
            }
        }
        return items;
    }

    static List<String> remove(List<String> recent, String prompt) {
        List<String> items = new ArrayList<>();
        if (recent != null) {
            for (String item : recent) {
                if (usable(item) && !item.equals(prompt)) {
                    items.add(item);
                }
            }
        }
        return items;
    }

    private static void addUnique(List<String> items, String item) {
        if (usable(item) && !items.contains(item) && items.size() < MAX) {
            items.add(item);
        }
    }

    private static boolean contains(JSONArray array, String item) {
        for (int index = 0; index < array.length(); index += 1) {
            if (item.equals(array.optString(index, ""))) {
                return true;
            }
        }
        return false;
    }

    private static boolean usable(String item) {
        return item != null && !item.trim().isEmpty();
    }
}
