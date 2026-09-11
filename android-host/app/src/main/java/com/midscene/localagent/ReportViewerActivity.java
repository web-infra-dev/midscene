package com.midscene.localagent;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.ViewGroup;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Opens a run artefact: Midscene's HTML report in a WebView, or a plain run log.
 *
 * Midscene reports are self-contained HTML files, so no network or extra assets
 * are needed to render them on the phone.
 */
public class ReportViewerActivity extends Activity {

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_PATH = "path";
    public static final String EXTRA_HTML = "html";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String title = getIntent().getStringExtra(EXTRA_TITLE);
        String path = getIntent().getStringExtra(EXTRA_PATH);
        boolean html = getIntent().getBooleanExtra(EXTRA_HTML, false);
        setTitle(title == null ? "Run artefact" : title);

        if (path == null || !new File(path).exists()) {
            TextView missing = new TextView(this);
            missing.setText("File not found: " + path);
            missing.setPadding(24, 24, 24, 24);
            setContentView(missing);
            return;
        }

        if (html) {
            WebView webView = new WebView(this);
            webView.getSettings().setJavaScriptEnabled(true);
            webView.getSettings().setAllowFileAccess(true);
            // Midscene reports are single-file HTML that boots from an embedded
            // script; file:// pages need these two switches before the WebView
            // will run their subresource loads.
            webView.getSettings().setAllowFileAccessFromFileURLs(true);
            webView.getSettings().setAllowUniversalAccessFromFileURLs(true);
            webView.getSettings().setDomStorageEnabled(true);
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage message) {
                    Log.i("MidsceneReport", message.message()
                            + " @" + message.lineNumber());
                    return true;
                }
            });
            webView.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            setContentView(webView);
            webView.loadUrl("file://" + path);
            return;
        }

        String text;
        try {
            text = new String(Files.readAllBytes(new File(path).toPath()), StandardCharsets.UTF_8);
        } catch (Exception error) {
            text = "Could not read " + path + "\n" + error;
        }

        TextView view = new TextView(this);
        view.setTypeface(Typeface.MONOSPACE);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        view.setTextColor(Color.DKGRAY);
        view.setTextIsSelectable(true);
        view.setText(text);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(view);
        setContentView(scroll);
    }
}
