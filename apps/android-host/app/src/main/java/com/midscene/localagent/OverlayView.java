package com.midscene.localagent;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.graphics.PorterDuff;
import android.graphics.RectF;
import android.graphics.RectF;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
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
    private static final int CHIP_COLOR = 0xFF1979FF;
    private static final int BEAM_COLOR = 0xFF1979FF;
    private static final long BOX_TTL_MS = 2500;
    private static final long RIPPLE_MS = 700;

    private static WindowManager windowManager;
    private static PillView pill;
    private static WindowManager.LayoutParams params;
    private static boolean suppressed;
    // User preferences (Settings): which visualisations to show, and how loud.
    private static boolean showBar = true;
    private static boolean showEdge = true;
    private static boolean showBox = true;
    private static boolean showRipple = true;
    private static boolean demoMode;
    private static boolean clearSystemBars;
    private static long boxUntil;
    private static RectF boxRect;
    private static float rippleX = -1;
    private static float rippleY = -1;
    private static long rippleStartedAt;
    private static boolean bypassReady;
    private static String lastText = "";

    private OverlayView() {
    }

    /** Applied when a run starts, from the Settings switches. */
    public static synchronized void setOptions(
            boolean bar,
            boolean edge,
            boolean box,
            boolean ripple,
            boolean demo,
            boolean clearBars) {
        showBar = bar;
        showEdge = edge;
        showBox = box;
        showRipple = ripple;
        demoMode = demo;
        clearSystemBars = clearBars;
        if (pill != null) {
            pill.invalidateVisuals();
        }
    }

    /** The element the agent located, in screen pixels; drawn until it fades out. */
    public static synchronized void showBox(float x, float y, float width, float height) {
        boxRect = new RectF(x, y, x + width, y + height);
        boxUntil = System.currentTimeMillis() + BOX_TTL_MS;
        if (pill != null) {
            pill.startAnimating();
        }
    }

    /** A tap the agent performed: a short ripple at that point. */
    public static synchronized void showRipple(float x, float y) {
        rippleX = x;
        rippleY = y;
        rippleStartedAt = System.currentTimeMillis();
        if (pill != null) {
            pill.startAnimating();
        }
    }

    public static synchronized void clearTransient() {
        boxRect = null;
        boxUntil = 0;
        rippleX = -1;
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
            // One full-screen surface carries every visualisation (bar, edge glow,
            // element box, tap ripple), so a single setSkipScreenshot covers them all.
            params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                            : WindowManager.LayoutParams.TYPE_PHONE,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                            // Without these the window manager insets the surface to
                            // avoid the status bar and the taskbar, so the frame never
                            // reached the physical screen edges.
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                params.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }
            params.gravity = Gravity.TOP | Gravity.START;
            params.x = 0;
            params.y = 0;
            // MATCH_PARENT is resolved against the *inset* frame on this device, so the
            // surface stopped short of the edges and the beam looked boxed in. Take the
            // display bounds explicitly instead.
            android.graphics.Rect bounds = displayBounds(app);
            if (bounds != null) {
                params.width = bounds.width();
                params.height = bounds.height();
            }
            // Touch events must reach the app underneath: this layer only observes.
            params.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;

            try {
                windowManager.addView(pill, params);
            } catch (Exception error) {
                pill = null;
                return;
            }
        }

        update(text);
        applyVisibility();
        if (pill != null) {
            pill.startAnimating();
        }
    }

    public static synchronized void update(String text) {
        updateProgress(new String[] { text == null ? "" : text });
    }

    /**
     * Bar contents, left to right: agent phase, step counter, current step text and
     * timings (see AgentService for the state machine that fills them).
     */
    public static synchronized void updateProgress(String[] fields) {
        if (fields == null || fields.length == 0) {
            return;
        }
        lastText = fields[0];
        if (pill != null) {
            pill.setFields(fields);
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

    /**
     * Re-render and, if the system dropped our window or surface, bring it back.
     *
     * Some system screens tear overlay surfaces down (or hide them); the service
     * calls this on a slow tick during a run so progress stays visible.
     */
    public static synchronized void refresh(String text) {
        if (windowManager == null) {
            return;
        }
        if (pill == null || pill.getParent() == null) {
            pill = null;
            return;
        }
        lastText = text == null ? lastText : text;
        pill.setFields(new String[] { lastText });
        resizeToContent();
        applyVisibility();
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

    private static android.graphics.Rect displayBounds(Context context) {
        try {
            WindowManager manager =
                    (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
            if (manager == null) {
                return null;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                return manager.getCurrentWindowMetrics().getBounds();
            }
            android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
            manager.getDefaultDisplay().getRealMetrics(metrics);
            return new android.graphics.Rect(0, 0, metrics.widthPixels, metrics.heightPixels);
        } catch (Throwable error) {
            return null;
        }
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    static void post(Runnable runnable) {
        new Handler(Looper.getMainLooper()).post(runnable);
    }

    /** The bar: drawn on a surface we own so it can opt out of captures. */
    private static final class PillView extends SurfaceView implements SurfaceHolder.Callback {
        private final Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint chip = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint titlePaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint chipPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint detailPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint metricsPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final float density = getResources().getDisplayMetrics().density;
        private String phase = "";
        private String stepChip = "";
        private String detail = "";
        private String metrics = "";
        private SurfaceControl surfaceControl;
        private boolean animating;
        private int systemInsetTop;
        private int systemInsetBottom;
        private int systemInsetLeft;
        private int systemInsetRight;

        private float topBeamSpace() {
            float band = (demoMode ? 10f : 5f) * density;
            float stroke = (demoMode ? 9f : 5.5f) * density;
            return band + stroke;
        }

        private void readSystemInsets() {
            try {
                android.view.WindowInsets insets = getRootWindowInsets();
                if (insets == null) {
                    return;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    android.graphics.Insets bars = insets.getInsets(
                            android.view.WindowInsets.Type.systemBars());
                    // The taskbar on large screens is a tappable element rather than a
                    // navigation bar, and it is drawn above an application overlay, so
                    // it has to be part of the safe area.
                    android.graphics.Insets tappable = insets.getInsets(
                            android.view.WindowInsets.Type.tappableElement());
                    systemInsetTop = bars.top;
                    systemInsetBottom = Math.max(bars.bottom, tappable.bottom);
                    systemInsetLeft = bars.left;
                    systemInsetRight = bars.right;
                } else {
                    systemInsetTop = insets.getSystemWindowInsetTop();
                    systemInsetBottom = insets.getSystemWindowInsetBottom();
                    systemInsetLeft = insets.getSystemWindowInsetLeft();
                    systemInsetRight = insets.getSystemWindowInsetRight();
                }
            } catch (Throwable ignored) {
                // fall back to the resource below
            }
            if (systemInsetBottom == 0) {
                // Last resort on devices that report nothing: the framework's own
                // navigation bar height, which a taskbar is at least as tall as.
                int id = getResources().getIdentifier(
                        "navigation_bar_height", "dimen", "android");
                if (id > 0) {
                    systemInsetBottom = getResources().getDimensionPixelSize(id);
                }
            }
            if (systemInsetTop == 0) {
                int id = getResources().getIdentifier(
                        "status_bar_height", "dimen", "android");
                if (id > 0) {
                    systemInsetTop = getResources().getDimensionPixelSize(id);
                }
            }
        }
        boolean hiddenFromCapture;

        PillView(Context context) {
            super(context);
            background.setColor(BG_COLOR);
            dot.setColor(DOT_COLOR);
            chip.setColor(CHIP_COLOR);
            titlePaint.setColor(Color.WHITE);
            titlePaint.setTextSize(12f * density);
            titlePaint.setFakeBoldText(true);
            chipPaint.setColor(Color.WHITE);
            chipPaint.setTextSize(10f * density);
            detailPaint.setColor(0xFFD8DEE9);
            detailPaint.setTextSize(11.5f * density);
            metricsPaint.setColor(0xFF8C93A0);
            metricsPaint.setTextSize(11f * density);
            setZOrderOnTop(true);
            setZOrderMediaOverlay(true);
            getHolder().setFormat(PixelFormat.TRANSLUCENT);
            getHolder().addCallback(this);
            setWillNotDraw(true);
        }

        void setFields(String[] fields) {
            String nextPhase = fields.length > 0 && fields[0] != null ? fields[0] : "";
            String nextChip = fields.length > 1 && fields[1] != null ? fields[1] : "";
            String nextDetail = fields.length > 2 && fields[2] != null ? fields[2] : "";
            String nextMetrics = fields.length > 3 && fields[3] != null ? fields[3] : "";
            if (nextPhase.equals(phase)
                    && nextChip.equals(stepChip)
                    && nextDetail.equals(detail)
                    && nextMetrics.equals(metrics)) {
                return;
            }
            phase = nextPhase;
            stepChip = nextChip;
            detail = nextDetail;
            metrics = nextMetrics;
            render();
        }

        int measuredWidth() {
            return getWidth();
        }

        int measuredHeight() {
            return getHeight();
        }

        /** One line of text, ellipsised into the space the caller allows. */
        private Layout fit(String value, TextPaint paint, int maxWidth) {
            return StaticLayout.Builder
                    .obtain(value == null ? "" : value, 0, value == null ? 0 : value.length(),
                            paint, Math.max(maxWidth, 40))
                    .setMaxLines(1)
                    .setEllipsize(TextUtils.TruncateAt.END)
                    .build();
        }

        void invalidateVisuals() {
            render();
        }

        /** Frame loop: only runs while there is something animated to show. */
        void startAnimating() {
            if (animating) {
                return;
            }
            animating = true;
            post(frame);
        }

        private final Runnable frame = new Runnable() {
            @Override
            public void run() {
                if (!animating) {
                    return;
                }
                render();
                // The border streak animates for as long as the overlay is up.
                boolean busy = showEdge
                        || System.currentTimeMillis() < boxUntil
                        || (rippleX >= 0
                        && System.currentTimeMillis() - rippleStartedAt < RIPPLE_MS);
                if (busy) {
                    postDelayed(this, 40);
                } else {
                    animating = false;
                    render();
                }
            }
        };

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
                int width = getWidth();
                int height = getHeight();
                if (width <= 0 || height <= 0) {
                    return;
                }
                canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
                long now = System.currentTimeMillis();

                drawBox(canvas, now);
                drawRipple(canvas, now);
                if (showBar) {
                    drawBar(canvas, width, height);
                }
                // Last, so the streak runs over the info bar instead of under it.
                drawBorderBeam(canvas, width, height, now);
            } finally {
                holder.unlockCanvasAndPost(canvas);
            }
        }

        /**
         * A light streak travelling around the frame: a comet head with a fading tail,
         * which reads as "the agent is driving" far better than a static glow.
         */
        private void drawBorderBeam(Canvas canvas, int width, int height, long now) {
            if (!showEdge) {
                return;
            }
            float stroke = (demoMode ? 9f : 5.5f) * density;

            // Follow the screen edge exactly: sharp corners, and the path half a
            // stroke in so the painted band starts at the border.
            float edge = stroke / 2f;
            // An application overlay is always composited below the system bars and the
            // taskbar, so on devices where that matters the beam can be pulled inside
            // them instead (the painted band then stops at their edge).
            float bottomEdge = clearSystemBars
                    ? edge + systemInsetBottom
                    : edge;
            float topEdge = clearSystemBars ? edge + systemInsetTop : edge;
            RectF frame = new RectF(edge, topEdge, width - edge, height - bottomEdge);
            Path path = new Path();
            path.addRect(frame, Path.Direction.CW);
            PathMeasure measure = new PathMeasure(path, false);
            float length = measure.getLength();
            if (length <= 0) {
                return;
            }

            // A faint frame keeps the border defined between passes of the streak.
            Paint framePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            framePaint.setStyle(Paint.Style.STROKE);
            framePaint.setStrokeWidth(1.2f * density);
            framePaint.setColor((BEAM_COLOR & 0x00FFFFFF) | (demoMode ? 0x44 : 0x22) << 24);
            canvas.drawPath(path, framePaint);

            long lapMs = demoMode ? 2200 : 3600;
            float head = ((now % lapMs) / (float) lapMs) * length;
            float tail = length * (demoMode ? 0.34f : 0.22f);
            int segments = 22;
            Path piece = new Path();
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeCap(Paint.Cap.ROUND);

            for (int i = 0; i < segments; i++) {
                float from = head - tail * (i + 1) / segments;
                float to = head - tail * i / segments;
                float start = ((from % length) + length) % length;
                float stop = ((to % length) + length) % length;

                piece.reset();
                if (start <= stop) {
                    measure.getSegment(start, stop, piece, true);
                } else {
                    measure.getSegment(start, length, piece, true);
                    measure.getSegment(0, stop, piece, true);
                }

                float fade = 1f - (float) i / segments;
                int alpha = Math.round(255 * fade * (demoMode ? 1f : 0.9f));
                // Constant width: a thinner tail segment sits further from the edge and
                // reads as a gap.
                paint.setStrokeWidth(stroke);
                paint.setColor((BEAM_COLOR & 0x00FFFFFF) | (alpha << 24));
                canvas.drawPath(piece, paint);
            }

            // A soft halo around the head.
            Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
            halo.setStyle(Paint.Style.STROKE);
            halo.setStrokeWidth(stroke * 2.6f);
            halo.setColor((BEAM_COLOR & 0x00FFFFFF) | (demoMode ? 0x3A : 0x24) << 24);
            piece.reset();
            float headStart = ((head - tail * 0.06f) % length + length) % length;
            if (headStart <= head) {
                measure.getSegment(headStart, head, piece, true);
            } else {
                measure.getSegment(headStart, length, piece, true);
                measure.getSegment(0, head, piece, true);
            }
            canvas.drawPath(piece, halo);
        }

        /** Dashed box around the element the agent located, fading out. */
        private void drawBox(Canvas canvas, long now) {
            if (!showBox || boxRect == null || now >= boxUntil) {
                return;
            }
            float remaining = (boxUntil - now) / (float) BOX_TTL_MS;
            int alpha = Math.round(255 * Math.min(1f, remaining * 2f));
            Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(2f * density);
            stroke.setColor((BEAM_COLOR & 0x00FFFFFF) | (alpha << 24));
            stroke.setPathEffect(new android.graphics.DashPathEffect(
                    new float[] { 10f * density, 6f * density }, 0));

            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor((BEAM_COLOR & 0x00FFFFFF) | (Math.round(alpha * 0.16f) << 24));

            RectF rect = new RectF(boxRect);
            float radius = 6f * density;
            canvas.drawRoundRect(rect, radius, radius, fill);
            canvas.drawRoundRect(rect, radius, radius, stroke);
        }

        /** Expanding ring where the agent tapped. */
        private void drawRipple(Canvas canvas, long now) {
            if (!showRipple || rippleX < 0) {
                return;
            }
            long elapsed = now - rippleStartedAt;
            if (elapsed >= RIPPLE_MS) {
                return;
            }
            float progress = elapsed / (float) RIPPLE_MS;
            int alpha = Math.round(200 * (1f - progress));
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2.5f * density);
            paint.setColor((BEAM_COLOR & 0x00FFFFFF) | (alpha << 24));
            canvas.drawCircle(rippleX, rippleY, (8f + 26f * progress) * density, paint);
        }

        private void drawBar(Canvas canvas, int width, int height) {
            float barHeight = 30 * density;
            float barTop = topBeamSpace();
            float corner = 16 * density;

            // A dark glass panel that fades into the screen, rounded at the bottom and
            // finished with a brand hairline: the same language as the border streak
            // instead of a slab that fights with it.
            Paint panel = new Paint(Paint.ANTI_ALIAS_FLAG);
            panel.setShader(new android.graphics.LinearGradient(
                    0, barTop, 0, barTop + barHeight,
                    0xF20E141C, 0xD90B0F15, android.graphics.Shader.TileMode.CLAMP));
            android.graphics.Path panelPath = new android.graphics.Path();
            panelPath.addRoundRect(
                    new RectF(0, barTop - corner, width, barTop + barHeight),
                    corner, corner, android.graphics.Path.Direction.CW);
            canvas.drawPath(panelPath, panel);

            Paint hairline = new Paint(Paint.ANTI_ALIAS_FLAG);
            hairline.setColor((BEAM_COLOR & 0x00FFFFFF) | 0x59 << 24);
            hairline.setStrokeWidth(1.5f * density);
            canvas.drawLine(corner / 2f, barTop + barHeight - 0.75f * density,
                    width - corner / 2f, barTop + barHeight - 0.75f * density, hairline);

            float pad = 14 * density;
            float dotSize = 7 * density;
            float centerY = barTop + barHeight / 2f;

            // A soft halo behind the state dot ties it to the beam.
            Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
            halo.setColor((BEAM_COLOR & 0x00FFFFFF) | 0x33 << 24);
            canvas.drawCircle(pad + dotSize / 2f, centerY, dotSize, halo);
            canvas.drawCircle(pad + dotSize / 2f, centerY, dotSize / 2f, dot);

            float cursor = pad + dotSize + 8 * density;
            canvas.save();
            canvas.translate(cursor, centerY - titlePaint.getTextSize() * 0.72f);
            fit(phase, titlePaint, Math.round(120 * density)).draw(canvas);
            canvas.restore();
            cursor += titlePaint.measureText(phase) + 10 * density;

            if (!stepChip.isEmpty()) {
                float chipWidth = chipPaint.measureText(stepChip) + 12 * density;
                float chipHeight = 16 * density;
                RectF chipRect = new RectF(cursor, centerY - chipHeight / 2f,
                        cursor + chipWidth, centerY + chipHeight / 2f);
                canvas.drawRoundRect(chipRect, chipHeight / 2f, chipHeight / 2f, chip);
                canvas.save();
                canvas.translate(cursor + 6 * density,
                        centerY - (chipPaint.getFontMetrics().descent
                                - chipPaint.getFontMetrics().ascent) / 2f
                                - chipPaint.getFontMetrics().ascent + 1);
                canvas.drawText(stepChip, 0, 0, chipPaint);
                canvas.restore();
                cursor += chipWidth + 10 * density;
            }

            float metricsWidth = metrics.isEmpty() ? 0 : metricsPaint.measureText(metrics);
            float metricsLeft = width - pad - metricsWidth;
            float detailSpace = Math.max(metricsLeft - cursor - 12 * density, 60 * density);

            canvas.save();
            canvas.translate(cursor, centerY - detailPaint.getTextSize() * 0.72f);
            fit(detail, detailPaint, Math.round(detailSpace)).draw(canvas);
            canvas.restore();

            if (!metrics.isEmpty()) {
                canvas.save();
                canvas.translate(metricsLeft, centerY - metricsPaint.getTextSize() * 0.72f);
                canvas.drawText(metrics, 0, 0, metricsPaint);
                canvas.restore();
            }
        }

        @Override
        public void surfaceCreated(SurfaceHolder holder) {
            surfaceControl = getSurfaceControl();
            hiddenFromCapture = applySkipScreenshot(surfaceControl);
            readSystemInsets();
            Log.i(TAG, "surface created, hiddenFromCapture=" + hiddenFromCapture
                    + " insets=" + systemInsetTop + "/" + systemInsetBottom);
            render();
            post(OverlayView::applyVisibility);
            startAnimating();
        }

        @Override
        public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            render();
        }

        @Override
        public void surfaceDestroyed(SurfaceHolder holder) {
            surfaceControl = null;
            Log.i(TAG, "surface destroyed");
        }

        @Override
        protected void onVisibilityChanged(View changedView, int visibility) {
            super.onVisibilityChanged(changedView, visibility);
            if (visibility == View.VISIBLE) {
                post(() -> {
                    render();
                    surfaceControl = getSurfaceControl();
                    hiddenFromCapture = applySkipScreenshot(surfaceControl);
                });
            }
        }

        @Override
        protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            post(this::render);
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
