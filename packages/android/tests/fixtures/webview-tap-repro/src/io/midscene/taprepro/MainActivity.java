package io.midscene.taprepro;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

public final class MainActivity extends Activity {
  private static final String TAG = "MidsceneTapRepro";
  private static final String PAGE_URL = "file:///android_asset/index.html";

  private WebView webView;
  private boolean guardEnabled;
  private boolean guardArmed;
  private boolean consumingGesture;
  private boolean gestureGuardCandidate;
  private String runId = "manual";
  private int loadGeneration;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WebView.setWebContentsDebuggingEnabled(true);
    webView = new WebView(this);
    webView.getSettings().setJavaScriptEnabled(true);
    webView.getSettings().setDomStorageEnabled(true);
    webView.addJavascriptInterface(new ReproBridge(), "AndroidBridge");
    webView.setWebViewClient(
        new WebViewClient() {
          @Override
          public void onPageFinished(WebView view, String url) {
            final int generation = loadGeneration;
            view.postDelayed(
                new Runnable() {
                  @Override
                  public void run() {
                    if (generation != loadGeneration) return;
                    guardArmed = guardEnabled;
                    consumingGesture = false;
                    gestureGuardCandidate = false;
                    notifyPage("ready", guardEnabled ? "guard armed" : "natural mode");
                    Log.i(
                        TAG, "run=" + runId + " ready guard=" + (guardEnabled ? 1 : 0));
                  }
                },
                250);
          }
        });
    webView.setOnTouchListener(
        new View.OnTouchListener() {
          @Override
          public boolean onTouch(View view, MotionEvent event) {
            return handleTouch(event);
          }
        });
    setContentView(webView);
    loadFromIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    loadFromIntent(intent);
  }

  private void loadFromIntent(Intent intent) {
    Uri uri = intent == null ? null : intent.getData();
    String requestedRunId = uri == null ? null : uri.getQueryParameter("run");
    runId = requestedRunId == null || requestedRunId.isEmpty() ? "manual" : requestedRunId;
    guardEnabled = uri != null && "1".equals(uri.getQueryParameter("guard"));
    guardArmed = false;
    consumingGesture = false;
    gestureGuardCandidate = false;
    loadGeneration += 1;
    String page =
        PAGE_URL
            + "?run="
            + Uri.encode(runId)
            + "&guard="
            + (guardEnabled ? "1" : "0");
    webView.loadUrl(page);
  }

  private boolean handleTouch(MotionEvent event) {
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        consumingGesture = false;
        gestureGuardCandidate = guardArmed;
        Log.i(TAG, "run=" + runId + " event=DOWN");
        return false;
      case MotionEvent.ACTION_MOVE:
        if (guardArmed && gestureGuardCandidate && !consumingGesture) {
          guardArmed = false;
          consumingGesture = true;
          MotionEvent cancel = MotionEvent.obtain(event);
          cancel.setAction(MotionEvent.ACTION_CANCEL);
          webView.onTouchEvent(cancel);
          cancel.recycle();
          notifyPage("ignored", "first gesture contained MOVE and was swallowed");
          Log.i(TAG, "run=" + runId + " guard_swallowed event=MOVE");
        }
        return consumingGesture;
      case MotionEvent.ACTION_UP:
        if (consumingGesture) {
          consumingGesture = false;
          gestureGuardCandidate = false;
          Log.i(TAG, "run=" + runId + " event=UP consumed=1");
          return true;
        }
        if (guardArmed && gestureGuardCandidate) {
          guardArmed = false;
          Log.i(TAG, "run=" + runId + " first_tap_accepted");
        }
        gestureGuardCandidate = false;
        return false;
      case MotionEvent.ACTION_CANCEL:
        boolean wasConsuming = consumingGesture;
        consumingGesture = false;
        gestureGuardCandidate = false;
        return wasConsuming;
      default:
        return consumingGesture;
    }
  }

  private void notifyPage(String state, String detail) {
    if (webView == null) return;
    String script =
        "window.onNativeState && window.onNativeState("
            + JSONObject.quote(state)
            + ","
            + JSONObject.quote(detail)
            + ")";
    webView.evaluateJavascript(script, null);
  }

  private final class ReproBridge {
    @JavascriptInterface
    public void onTap(String pageRunId, int tapCount) {
      Log.i(TAG, "run=" + pageRunId + " tap_count=" + tapCount);
    }
  }
}
