package com.midscene.ime;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.inputmethodservice.InputMethodService;

/**
 * Minimal IME for Midscene automation. Provides keyboard dismissal via
 * broadcast using requestHideSelf(), which hides the keyboard without
 * sending ESC/BACK key events to the focused input field.
 *
 * Usage:
 *   adb shell ime set com.midscene.ime/.MidsceneIME
 *   adb shell am broadcast -a com.midscene.ime.DISMISS
 *   adb shell ime set <original_ime>
 */
public class MidsceneIME extends InputMethodService {

    private static final String ACTION_DISMISS = "com.midscene.ime.DISMISS";
    private static final String ACTION_INPUT_TEXT = "com.midscene.ime.INPUT_TEXT";

    private BroadcastReceiver receiver;

    @Override
    public void onCreate() {
        super.onCreate();
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (ACTION_DISMISS.equals(action)) {
                    requestHideSelf(0);
                } else if (ACTION_INPUT_TEXT.equals(action)) {
                    String text = intent.getStringExtra("text");
                    if (text != null && getCurrentInputConnection() != null) {
                        getCurrentInputConnection().commitText(text, 1);
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_DISMISS);
        filter.addAction(ACTION_INPUT_TEXT);
        registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
    }

    @Override
    public void onDestroy() {
        if (receiver != null) {
            unregisterReceiver(receiver);
        }
        super.onDestroy();
    }
}
