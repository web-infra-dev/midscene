package com.midscene.localagent;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.graphics.PorterDuff;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.provider.Settings;
import android.text.TextPaint;
import android.text.TextUtils;
import android.view.Gravity;
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
    private static final int DOT_COLOR = 0xFF1979FF;
    private static final int OK_COLOR = 0xFF12B981;
    private static final int FAIL_COLOR = 0xFFE13E37;
    private static final int CHIP_COLOR = 0xFF1979FF;
    private static final int BEAM_COLOR = 0xFF1979FF;
    private static final float MAX_CARD_WIDTH_DP = 480f;
    private static final float MIN_CARD_WIDTH_DP = 148f;
    private static final float MIN_TOP_INSET_DP = 24f;
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
            boolean demo) {
        showBar = bar;
        showEdge = edge;
        showBox = box;
        showRipple = ripple;
        demoMode = demo;
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
        pill.invalidate();
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
        /** Raw runner state ("acting", "done", …) — drives the dot colour only. */
        private String state = "";
        /** Step/run start times while the clock should tick; 0 keeps `metrics` frozen. */
        private long stepStartedAt;
        private long runStartedAt;
        private String frozenMetrics = "";
        private SurfaceControl surfaceControl;
        private boolean animating;
        private int systemInsetTop;
        private int systemInsetBottom;
        private int systemInsetLeft;
        private int systemInsetRight;

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
            String nextState = fields.length > 4 && fields[4] != null ? fields[4] : "";
            long nextStepStart = parseTime(fields, 5);
            long nextRunStart = parseTime(fields, 6);
            if (nextPhase.equals(phase)
                    && nextChip.equals(stepChip)
                    && nextDetail.equals(detail)
                    && nextMetrics.equals(frozenMetrics)
                    && nextState.equals(state)
                    && nextStepStart == stepStartedAt
                    && nextRunStart == runStartedAt) {
                return;
            }
            phase = nextPhase;
            stepChip = nextChip;
            detail = nextDetail;
            frozenMetrics = nextMetrics;
            state = nextState;
            stepStartedAt = nextStepStart;
            runStartedAt = nextRunStart;
            render();
        }

        private long parseTime(String[] fields, int index) {
            if (fields.length <= index || fields[index] == null) {
                return 0;
            }
            try {
                return Long.parseLong(fields[index]);
            } catch (NumberFormatException error) {
                return 0;
            }
        }

        /**
         * The timings as they should read right now.
         *
         * Events arrive per step, and one step can run for half a minute, so a string
         * computed when the event arrived used to sit frozen on screen. The frame loop
         * already redraws while the streak animates, so the clock ticks there.
         */
        private String liveMetrics() {
            if (stepStartedAt <= 0) {
                return frozenMetrics;
            }
            long now = System.currentTimeMillis();
            return ProgressText.timings(now - stepStartedAt,
                    runStartedAt > 0 ? now - runStartedAt : 0);
        }

        int measuredWidth() {
            return getWidth();
        }

        int measuredHeight() {
            return getHeight();
        }

        /**
         * One line of text, ellipsised to `maxWidth`. Returns the text itself, so callers
         * measure what is drawn: advancing a cursor by the *unclipped* width was how the
         * step chip and the timings ended up overlapping each other.
         */
        private CharSequence ellipsize(String value, TextPaint paint, float maxWidth) {
            if (value == null || value.isEmpty()) {
                return "";
            }
            return TextUtils.ellipsize(value, paint, Math.max(maxWidth, 0f), TextUtils.TruncateAt.END);
        }

        /** Green once a step or the run is done, red when it failed, brand blue while busy. */
        private int stateColor() {
            switch (state) {
                case "done":
                case "step done":
                    return OK_COLOR;
                case "failed":
                case "step failed":
                    return FAIL_COLOR;
                default:
                    return DOT_COLOR;
            }
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
            // Always flush with the screen: the beam hugs the physical edges.
            RectF frame = new RectF(edge, edge, width - edge, height - edge);
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

        /**
         * The status card: state dot, what the agent is doing, which step, the step in
         * words, and the timings — on two rows inside a centred card.
         *
         * It sits *below* the system status bar and is sized to its content. The previous
         * version was a full-width slab at ~10dp from the top edge, i.e. behind the clock
         * and the battery icons (the top inset it read was only ever logged), and wide
         * enough to cover the app's own header underneath.
         */
        private void drawBar(Canvas canvas, int width, int height) {
            float margin = 16 * density;
            float pad = 13 * density;
            float dotSize = 7 * density;
            float dotGap = 8 * density;
            float rowHeight = 19 * density;
            float detailHeight = 17 * density;
            float rowGap = 5 * density;
            float chipGap = 8 * density;
            boolean hasDetail = !detail.isEmpty();

            // Size the card to its content: a one-word state ("Ready") becomes a small
            // pill instead of a full-width slab, which is also what keeps it from covering
            // more of the app underneath than it has to. Clamped, so a long step ellipsises
            // rather than running off the screen.
            String liveMetrics = liveMetrics();
            float chipBox = stepChip.isEmpty() ? 0 : chipPaint.measureText(stepChip) + 14 * density;
            float row1Needed = dotSize + dotGap
                    + titlePaint.measureText(phase)
                    + (chipBox > 0 ? chipGap + chipBox : 0)
                    + (liveMetrics.isEmpty() ? 0 : 12 * density + metricsPaint.measureText(liveMetrics));
            float contentWidth = Math.max(row1Needed,
                    hasDetail ? detailPaint.measureText(detail) : 0);
            float cardWidth = Math.min(
                    Math.max(contentWidth + pad * 2, MIN_CARD_WIDTH_DP * density),
                    Math.min(width - 2 * margin, MAX_CARD_WIDTH_DP * density));
            float left = (width - cardWidth) / 2f;
            float top = Math.max(systemInsetTop, MIN_TOP_INSET_DP * density) + 12 * density;
            float cardHeight = pad * 2 + rowHeight + (hasDetail ? rowGap + detailHeight : 0);
            RectF card = new RectF(left, top, left + cardWidth, top + cardHeight);

            // Dark glass, rounded on every corner: the same language as the border streak.
            float corner = 16 * density;
            Paint panel = new Paint(Paint.ANTI_ALIAS_FLAG);
            panel.setShader(new LinearGradient(0, card.top, 0, card.bottom,
                    0xF20E141C, 0xE60B0F15, Shader.TileMode.CLAMP));
            canvas.drawRoundRect(card, corner, corner, panel);
            Paint hairline = new Paint(Paint.ANTI_ALIAS_FLAG);
            hairline.setStyle(Paint.Style.STROKE);
            hairline.setStrokeWidth(1.2f * density);
            hairline.setColor((BEAM_COLOR & 0x00FFFFFF) | 0x44 << 24);
            canvas.drawRoundRect(card, corner, corner, hairline);

            float innerLeft = left + pad;
            float innerRight = left + cardWidth - pad;
            float centerY = top + pad + rowHeight / 2f;

            // The timings are right-aligned, so they are measured first and everything on
            // that row fits beside them.
            CharSequence metricsText = ellipsize(liveMetrics, metricsPaint, (cardWidth - 2 * pad) * 0.45f);
            float metricsWidth = metricsPaint.measureText(metricsText, 0, metricsText.length());
            float row1Right = innerRight - (metricsWidth > 0 ? metricsWidth + 12 * density : 0);

            // Same for the chip: measure it before fitting the label that precedes it.
            float chipWidth = stepChip.isEmpty() ? 0 : chipPaint.measureText(stepChip) + 14 * density;
            float phaseGap = chipWidth > 0 ? chipGap : 0;
            float textLeft = innerLeft + dotSize + dotGap;
            float phaseSpace = row1Right - textLeft - chipWidth - phaseGap;
            CharSequence phaseText = ellipsize(phase, titlePaint, phaseSpace);
            float phaseWidth = titlePaint.measureText(phaseText, 0, phaseText.length());

            int accent = stateColor();
            Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
            halo.setColor((accent & 0x00FFFFFF) | 0x33 << 24);
            canvas.drawCircle(innerLeft + dotSize / 2f, centerY, dotSize, halo);
            dot.setColor(accent);
            canvas.drawCircle(innerLeft + dotSize / 2f, centerY, dotSize / 2f, dot);

            canvas.drawText(phaseText, 0, phaseText.length(), textLeft,
                    centerY - centered(titlePaint), titlePaint);
            float cursor = textLeft + phaseWidth + phaseGap;

            // Only when the fitted row above left room for it: an overlapping chip is
            // worse than no chip.
            if (chipWidth > 0 && cursor + chipWidth <= row1Right + 1) {
                float chipHeight = 16 * density;
                canvas.drawRoundRect(
                        new RectF(cursor, centerY - chipHeight / 2f,
                                cursor + chipWidth, centerY + chipHeight / 2f),
                        chipHeight / 2f, chipHeight / 2f, chip);
                canvas.drawText(stepChip, cursor + 7 * density,
                        centerY - centered(chipPaint), chipPaint);
            }

            if (metricsWidth > 0) {
                canvas.drawText(metricsText, 0, metricsText.length(), innerRight - metricsWidth,
                        centerY - centered(metricsPaint), metricsPaint);
            }

            if (hasDetail) {
                CharSequence detailText = ellipsize(detail, detailPaint, cardWidth - 2 * pad);
                float detailCenter = top + pad + rowHeight + rowGap + detailHeight / 2f;
                canvas.drawText(detailText, 0, detailText.length(), innerLeft,
                        detailCenter - centered(detailPaint), detailPaint);
            }
        }

        /** Baseline offset that centres one line of `paint` on a row's centre. */
        private float centered(TextPaint paint) {
            Paint.FontMetrics font = paint.getFontMetrics();
            return (font.ascent + font.descent) / 2f;
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

}
