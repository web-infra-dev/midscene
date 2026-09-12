package com.midscene.localagent;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.PorterDuff;
import android.graphics.RectF;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.SurfaceControl;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;

import org.lsposed.hiddenapibypass.HiddenApiBypass;

import java.lang.reflect.Method;

/**
 * Floating progress pill, drawn on a surface we own.
 *
 * The content lives on a {@link SurfaceView} so the window has a SurfaceControl we
 * can mark with `setSkipScreenshot(true)`: the layer then stays on screen but never
 * appears in ScreenCapture or screencap output, which is what lets diagnostics stay
 * visible for the whole run instead of blinking out around every capture.
 *
 * Everything is best-effort and degrades to plan A: when the hidden API, the
 * bypass or the API level is unavailable, {@link #setSuppressed(boolean)} still
 * hides the pill for the duration of a capture (see ExecBridge).
 */
public final class OverlayView {

    private static final String TAG = "MidsceneOverlay";
    private static final int BG_COLOR = 0xE60D0D0D;
    private static final int DOT_COLOR = 0xFF1979FF;

    private static WindowManager windowManager;
    private static PillView pill;
    private static WindowManager.LayoutParams params;
    private static boolean suppressed;
    private static boolean bypassReady;
    private static String lastText = "";

    private OverlayView() {
    }

    public static boolean canDraw(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    /** True when the platform can keep this layer out of captures. */
    public static boolean isHiddenFromCapture() {
        return pill != null && pill.hiddenFromCapture;
    }

    private static void prepareHiddenApis() {
        if (bypassReady) {
            return;
        }
        bypassReady = true;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            return;
        }
        try {
            HiddenApiBypass.addHiddenApiExemptions(
                    "Landroid/view/SurfaceControl;",
                    "Landroid/view/SurfaceControl$Transaction;");
        } catch (Throwable error) {
            // Plan A still works; nothing else to do.
        }
    }

    public static synchronized void show(Context context, String text) {
        if (!canDraw(context)) {
            return;
        }
        prepareHiddenApis();
        Context app = context.getApplicationContext();

        if (pill == null) {
            windowManager = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
            if (windowManager == null) {
                return;
            }

            pill = new PillView(app);
            params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                            : WindowManager.LayoutParams.TYPE_PHONE,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                    PixelFormat.TRANSLUCENT);
            params.gravity = Gravity.TOP | Gravity.START;
            params.x = dp(app, 16);
            params.y = dp(app, 96);
            pill.setOnTouchListener(new DragListener(app));

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
        if (pill != null) {
            pill.setText(lastText);
            resizeToContent();
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
    }

    /** Plan A fallback: hide while a capture runs, when the layer cannot opt out. */
    public static synchronized void setSuppressed(boolean value) {
        suppressed = value;
        applyVisibility();
    }

    private static void applyVisibility() {
        if (pill == null) {
            return;
        }
        // A surface that opts out of captures stays visible; otherwise hide it.
        boolean hide = suppressed && !pill.hiddenFromCapture;
        pill.setVisibility(hide ? View.GONE : View.VISIBLE);
    }

    private static void resizeToContent() {
        if (pill == null || params == null || windowManager == null) {
            return;
        }
        int width = pill.measuredWidth();
        int height = pill.measuredHeight();
        if (width <= 0 || height <= 0) {
            return;
        }
        if (params.width != width || params.height != height) {
            params.width = width;
            params.height = height;
            try {
                windowManager.updateViewLayout(pill, params);
            } catch (Exception ignored) {
                // the view is being detached
            }
        }
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

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    static void post(Runnable runnable) {
        new Handler(Looper.getMainLooper()).post(runnable);
    }

    /** The pill itself: a rounded card with a status dot, drawn on its own surface. */
    private static final class PillView extends SurfaceView implements SurfaceHolder.Callback {
        private final Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint textPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final float density = getResources().getDisplayMetrics().density;
        private String text = "";
        private int measuredWidth;
        private int measuredHeight;
        private SurfaceControl surfaceControl;
        boolean hiddenFromCapture;

        PillView(Context context) {
            super(context);
            background.setColor(BG_COLOR);
            dot.setColor(DOT_COLOR);
            textPaint.setColor(Color.WHITE);
            textPaint.setTextSize(13f * density);
            // A translucent, top-most surface: the window itself draws nothing.
            setZOrderOnTop(true);
            setZOrderMediaOverlay(true);
            getHolder().setFormat(PixelFormat.TRANSLUCENT);
            getHolder().addCallback(this);
            setWillNotDraw(true);
        }

        void setText(String value) {
            if (value.equals(text)) {
                return;
            }
            text = value;
            measure();
            render();
        }

        int measuredWidth() {
            return measuredWidth;
        }

        int measuredHeight() {
            return measuredHeight;
        }

        private Layout layout() {
            int maxTextWidth = Math.round(
                    getResources().getDisplayMetrics().widthPixels - 96f * density);
            return StaticLayout.Builder
                    .obtain(text, 0, text.length(), textPaint, Math.max(maxTextWidth, 120))
                    .setMaxLines(2)
                    .setEllipsize(TextUtils.TruncateAt.END)
                    .setLineSpacing(0f, 1.1f)
                    .build();
        }

        private void measure() {
            Layout layout = layout();
            int padH = Math.round(14 * density);
            int padV = Math.round(9 * density);
            int dotSize = Math.round(8 * density);
            int gap = Math.round(8 * density);
            measuredWidth = padH * 2 + dotSize + gap + layout.getWidth();
            measuredHeight = padV * 2 + Math.max(layout.getHeight(), dotSize);
        }

        private void render() {
            SurfaceHolder holder = getHolder();
            Canvas canvas = null;
            try {
                canvas = holder.lockCanvas();
            } catch (Exception ignored) {
                return;
            }
            if (canvas == null) {
                return;
            }
            try {
                canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
                float radius = measuredHeight / 2f;
                canvas.drawRoundRect(
                        new RectF(0, 0, measuredWidth, measuredHeight), radius, radius, background);

                float padH = 14 * density;
                float dotSize = 8 * density;
                float top = (measuredHeight - dotSize) / 2f;
                canvas.drawCircle(padH + dotSize / 2f, top + dotSize / 2f, dotSize / 2f, dot);

                canvas.save();
                canvas.translate(padH + dotSize + 8 * density,
                        (measuredHeight - layout().getHeight()) / 2f);
                layout().draw(canvas);
                canvas.restore();
            } finally {
                holder.unlockCanvasAndPost(canvas);
            }
        }

        @Override
        public void surfaceCreated(SurfaceHolder holder) {
            surfaceControl = getSurfaceControl();
            hiddenFromCapture = applySkipScreenshot(surfaceControl);
            render();
            post(OverlayView::applyVisibility);
        }

        @Override
        public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            render();
        }

        @Override
        public void surfaceDestroyed(SurfaceHolder holder) {
            surfaceControl = null;
        }
    }

    /**
     * Mark our layer as "not part of screenshots".
     *
     * `setSkipScreenshot` is hidden API with two shapes across releases (with and
     * without an explicit SurfaceControl), so both are attempted and any failure
     * means plan A takes over.
     */
    private static boolean applySkipScreenshot(SurfaceControl surfaceControl) {
        if (surfaceControl == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return false;
        }
        prepareHiddenApis();
        try {
            SurfaceControl.Transaction transaction = new SurfaceControl.Transaction();
            Method withArg = null;
            try {
                withArg = SurfaceControl.Transaction.class
                        .getDeclaredMethod("setSkipScreenshot", SurfaceControl.class, boolean.class);
            } catch (NoSuchMethodException ignored) {
                // older shape: the transaction already targets one surface
            }
            Method withoutArg = null;
            if (withArg == null) {
                withoutArg = SurfaceControl.Transaction.class
                        .getDeclaredMethod("setSkipScreenshot", boolean.class);
            }
            if (withArg != null) {
                withArg.invoke(transaction, surfaceControl, true);
            } else {
                withoutArg.invoke(transaction, true);
            }
            SurfaceControl.Transaction.class.getMethod("apply").invoke(transaction);
            return true;
        } catch (Throwable error) {
            return false;
        }
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
                    int width = pill != null && pill.measuredWidth() > 0
                            ? pill.measuredWidth() : dp(context, 200);
                    int height = pill != null && pill.measuredHeight() > 0
                            ? pill.measuredHeight() : dp(context, 40);
                    params.x = Math.max(0, Math.min(startX + dx, screenWidth - width));
                    params.y = Math.max(dp(context, 40),
                            Math.min(startY + dy, screenHeight - height - dp(context, 80)));
                    if (windowManager != null && pill != null) {
                        windowManager.updateViewLayout(pill, params);
                    }
                    return true;
                }
                case MotionEvent.ACTION_UP:
                    if (moved && windowManager != null && pill != null) {
                        int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
                        params.x = params.x + pill.measuredWidth() / 2 < screenWidth / 2
                                ? dp(context, 12)
                                : screenWidth - pill.measuredWidth() - dp(context, 12);
                        windowManager.updateViewLayout(pill, params);
                    }
                    return true;
                default:
                    return false;
            }
        }
    }
}
