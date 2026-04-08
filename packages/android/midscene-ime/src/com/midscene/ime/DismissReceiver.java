package com.midscene.ime;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Static receiver declared in manifest. The actual dismiss logic lives in
 * the dynamic receiver inside MidsceneIME (which has access to requestHideSelf).
 */
public class DismissReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // The dynamic receiver in MidsceneIME handles the actual dismiss.
    }
}
