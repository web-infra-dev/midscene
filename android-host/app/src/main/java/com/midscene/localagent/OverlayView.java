package com.midscene.localagent;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Floating progress pill.
 *
 * Shows what the agent is doing while the console is in the background. It must
 * never appear in the agent's own screenshots (they end up in the report), so the
 * app hides it for the duration of any `screencap` command - see
 * {@link #setSuppressed(boolean)} and its use in {@link ExecBridge}.
 */
public final class OverlayView {

    private static final String TAG = "MidsceneOverlay";

    private static WindowManager windowManager;
    private static View pill;
    private static TextView label;
    private static WindowManager.LayoutParams params;
    private static boolean suppressed;
    private static String lastText = "";

    private OverlayView() {
    }

    public static boolean canDraw(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    public static synchronized void show(Context context, String text) {
        if (!canDraw(context)) {
            return;
        }
        Context app = context.getApplicationContext();
        if (pill == null) {
            windowManager = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
            if (windowManager == null) {
                return;
            }

            LinearLayout container = new LinearLayout(app);
            container.setOrientation(LinearLayout.HORIZONTAL);
            container.setGravity(Gravity.CENTER_VERTICAL);
            int padH = dp(app, 14);
            int padV = dp(app, 8);
            container.setPadding(padH, padV, padH, padV);

            GradientDrawable background = new GradientDrawable();
            background.setColor(Color.parseColor("#E60D0D0D"));
            background.setCornerRadius(dp(app, 22));
            container.setBackground(background);

            View dot = new View(app);
            GradientDrawable dotDrawable = new GradientDrawable();
            dotDrawable.setShape(GradientDrawable.OVAL);
            dotDrawable.setColor(Color.parseColor("#1979FF"));
            dot.setBackground(dotDrawable);
            LinearLayout.LayoutParams dotParams =
                    new LinearLayout.LayoutParams(dp(app, 8), dp(app, 8));
            dotParams.rightMargin = dp(app, 8);
            container.addView(dot, dotParams);

            label = new TextView(app);
            label.setTextColor(Color.WHITE);
            label.setTextSize(12);
            // Two lines plus a bounded width: the pill used to run off the screen
            // edge (LAYOUT_NO_LIMITS) and cut the message off.
            label.setMaxLines(2);
            label.setEllipsize(android.text.TextUtils.TruncateAt.END);
            label.setLineSpacing(0f, 1.15f);
            container.addView(label);

            int screenWidth = app.getResources().getDisplayMetrics().widthPixels;
            int maxWidth = screenWidth - dp(app, 56);
            params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                            : WindowManager.LayoutParams.TYPE_PHONE,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                    PixelFormat.TRANSLUCENT);
            params.width = maxWidth;
            params.gravity = Gravity.TOP | Gravity.START;
            params.x = dp(app, 16);
            params.y = dp(app, 240);
            params.alpha = 0.92f;

            container.setOnTouchListener(new DragListener(app));
            pill = container;
            try {
                windowManager.addView(pill, params);
            } catch (Exception error) {
                pill = null;
                return;
            }
        }

        update(text);
        applyVisibility();
    }

    public static synchronized void update(String text) {
        lastText = text == null ? "" : text;
        if (label != null) {
            label.setText(trim(lastText));
        }
    }

    public static synchronized void hide() {
        if (windowManager != null && pill != null) {
            try {
                windowManager.removeView(pill);
            } catch (Exception ignored) {
                // already detached
            }
        }
        pill = null;
        label = null;
    }

    /** Hide while a screenshot is taken, so the agent never captures this pill. */
    public static synchronized void setSuppressed(boolean value) {
        suppressed = value;
        applyVisibility();
    }

    private static void applyVisibility() {
        if (pill == null) {
            return;
        }
        pill.setVisibility(suppressed ? View.GONE : View.VISIBLE);
    }

    /** One terse line for the pill: the most informative tail of a log line. */
    public static String summarize(String line) {
        if (line == null) {
            return "";
        }
        String text = line.trim();
        if (text.startsWith("[task] running")) {
            return "Running " + text.replace("[task] running", "").trim();
        }
        if (text.startsWith("{\"") || text.startsWith("\"") || text.startsWith("}")) {
            return lastText;
        }
        if (text.startsWith("[")) {
            int close = text.indexOf(']');
            if (close > 0 && close < 40) {
                return text.substring(1, close) + text.substring(close + 1);
            }
        }
        return text;
    }

    private static String trim(String text) {
        // Two lines at ~26 characters fit the bounded width.
        return text.length() > 52 ? text.substring(0, 52) + "…" : text;
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    private static final class DragListener implements View.OnTouchListener {
        private final Context context;
        private int startX;
        private int startY;
        private float touchX;
        private float touchY;
        private boolean moved;

        DragListener(Context context) {
            this.context = context;
        }

        @Override
        public boolean onTouch(View view, MotionEvent event) {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    startX = params.x;
                    startY = params.y;
                    touchX = event.getRawX();
                    touchY = event.getRawY();
                    moved = false;
                    return true;
                case MotionEvent.ACTION_MOVE: {
                    int dx = (int) (event.getRawX() - touchX);
                    int dy = (int) (event.getRawY() - touchY);
                    if (Math.abs(dx) > dp(context, 4) || Math.abs(dy) > dp(context, 4)) {
                        moved = true;
                    }
                    int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
                    int screenHeight = context.getResources().getDisplayMetrics().heightPixels;
                    int pillWidth = pill.getWidth() > 0 ? pill.getWidth() : dp(context, 200);
                    int pillHeight = pill.getHeight() > 0 ? pill.getHeight() : dp(context, 40);
                    params.x = Math.max(0, Math.min(startX + dx, screenWidth - pillWidth));
                    params.y = Math.max(dp(context, 40),
                            Math.min(startY + dy, screenHeight - pillHeight - dp(context, 80)));
                    if (windowManager != null && pill != null) {
                        windowManager.updateViewLayout(pill, params);
                    }
                    return true;
                }
                case MotionEvent.ACTION_UP:
                    if (moved && windowManager != null && pill != null) {
                        // Snap to the nearest horizontal edge.
                        int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
                        params.x = params.x + pill.getWidth() / 2 < screenWidth / 2
                                ? dp(context, 12)
                                : screenWidth - pill.getWidth() - dp(context, 12);
                        windowManager.updateViewLayout(pill, params);
                    }
                    return true;
                default:
                    return false;
            }
        }
    }

    /** Called from the service thread; the pill itself must be touched on the UI thread. */
    static void post(Runnable runnable) {
        new Handler(Looper.getMainLooper()).post(runnable);
    }
}
