package com.midscene.android;

import android.annotation.SuppressLint;
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
import android.view.MotionEvent;

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
    private static final long BOX_TTL_MS = 2500;
    private static final long RIPPLE_MS = 700;
    /**
     * Where Android 12 starts treating an untrusted window as "obscuring" and drops
     * touches aimed at whatever is underneath. Matches the platform default of
     * `Settings.Global.maximum_obscuring_opacity_for_touch`.
     */
    private static final float DEFAULT_MAX_OBSCURING_OPACITY = 0.8f;
    private static final String SETTING_MAX_OBSCURING_OPACITY =
            "maximum_obscuring_opacity_for_touch";
    /** Headroom below the threshold, so a near-miss cannot tip the layer over it. */
    private static final float OBSCURING_HEADROOM = 0.05f;
    /**
     * How many input windows this layer contributes to the obscuring-opacity sum:
     * the window itself, plus the child window `SurfaceView` registers for its own
     * surface. Both carry the window alpha, and the dispatcher accumulates them as
     * `1 - (1 - alpha)^n`.
     *
     * Measured on the car unit: at alpha 0.75 the layer stopped blocking at a
     * threshold of 0.94 but not 0.90, i.e. an effective opacity of ~0.9375 =
     * `1 - (1 - 0.75)^2` — two windows, not one. Lowering only the parent window
     * therefore looked like it had done nothing.
     */
    private static final int OBSCURING_WINDOWS = 2;

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
    /**
     * Whether the layer may be shown at all. Kept here as well as in the caller so
     * a run that starts while the switch is off cannot bring it back, and so the
     * exit path can drop the window without touching the service.
     */
    private static boolean showEnabled = true;
    /** Window alpha actually used, kept so every params push re-asserts the same value. */
    private static float safeAlpha = 0.5f;
    /** The stop control, in a window of its own so only that rect can take a touch. */
    private static StopView stopButton;
    private static WindowManager.LayoutParams stopParams;
    /** Whether this run may be interrupted at all (see {@link #setStoppable}). */
    private static boolean stoppable;
    /** Set by the tap, until the overlay comes down: the panel has to show the tap landed. */
    private static boolean stopping;

    private OverlayView() {
    }

    /**
     * The panel's box and its stop control's box, in screen pixels.
     *
     * The size is a function of the screen, never of the text. Timings tick ("9s" → "10s"),
     * a step line grows and shrinks between steps, and a card that was sized to its content
     * therefore resized and re-centred every second — the twitching this replaces. A fixed
     * box also gives the stop control a position that does not move under the user's finger.
     *
     * Pure arithmetic on purpose: a unit test holds the two properties that matter, that the
     * box ignores the text and that the button stays inside the card.
     */
    static final class Panel {

        static final float WIDTH_DP = 280f;
        static final float PAD_DP = 13f;
        static final float ROW_HEIGHT_DP = 19f;
        static final float DETAIL_HEIGHT_DP = 17f;
        static final float MIN_TOP_INSET_DP = 24f;
        static final float BUTTON_WIDTH_DP = 64f;
        static final float BUTTON_HEIGHT_DP = 26f;
        private static final float MARGIN_DP = 16f;
        private static final float ROW_GAP_DP = 5f;
        private static final float TOP_GAP_DP = 12f;
        private static final float BUTTON_GAP_DP = 10f;

        final float left;
        final float top;
        final float width;
        final float height;
        final float buttonLeft;
        final float buttonTop;
        final float buttonWidth;
        final float buttonHeight;

        Panel(int screenWidth, int systemInsetTop, float density) {
            float margin = MARGIN_DP * density;
            width = Math.min(WIDTH_DP * density, Math.max(screenWidth - 2 * margin, 0f));
            // Both rows always exist, empty or not: a card that grew a row when a step
            // description arrived would move the stop control down by 22dp mid-run.
            height = (PAD_DP * 2 + ROW_HEIGHT_DP + ROW_GAP_DP + DETAIL_HEIGHT_DP) * density;
            left = (screenWidth - width) / 2f;
            top = Math.max(systemInsetTop, MIN_TOP_INSET_DP * density) + TOP_GAP_DP * density;
            buttonWidth = BUTTON_WIDTH_DP * density;
            buttonHeight = BUTTON_HEIGHT_DP * density;
            buttonLeft = left + width - PAD_DP * density - buttonWidth;
            buttonTop = top + PAD_DP * density + (ROW_HEIGHT_DP * density - buttonHeight) / 2f;
        }

        float innerLeft(float density) {
            return left + PAD_DP * density;
        }

        /** Where the first row's text stops: the stop control owns everything to its right. */
        float textRight(float density) {
            return buttonLeft - BUTTON_GAP_DP * density;
        }

        float buttonRight(float density) {
            return buttonLeft + buttonWidth;
        }

        float rowCenterY(float density) {
            return top + PAD_DP * density + ROW_HEIGHT_DP * density / 2f;
        }

        float detailCenterY(float density) {
            return top + (PAD_DP + ROW_HEIGHT_DP + ROW_GAP_DP + DETAIL_HEIGHT_DP / 2f) * density;
        }
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
        syncStopButton();
    }

    /**
     * Whether the run in flight may be interrupted from the panel.
     *
     * Provisioning must not offer it: its worker is what unpacks Node and the agent, and
     * killing it half way leaves a runtime the next run has to repair. The service decides,
     * because it knows which kind of work it started.
     */
    public static synchronized void setStoppable(boolean value) {
        stoppable = value;
        stopping = false;
        syncStopButton();
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
                    "Landroid/view/SurfaceControl$Transaction;",
                    // The stop control's window: AttachedSurfaceControl is the public
                    // handle, and the surface control behind it is a hidden method.
                    "Landroid/view/ViewRootImpl;");
        } catch (Throwable error) {
            // Plan A still works; nothing else to do.
        }
    }

    public static synchronized void show(Context context, String text) {
        if (!showEnabled || !canDraw(context)) {
            return;
        }
        prepareHiddenApis();
        Context app = context.getApplicationContext();
        safeAlpha = obscuringSafeAlpha(app);

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
            applyTouchTransparency(params);

            try {
                windowManager.addView(pill, params);
            } catch (Exception error) {
                pill = null;
                return;
            }
        }

        update(text);
        applyVisibility();
        syncStopButton();
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
        removeStopButton();
        if (windowManager != null && pill != null) {
            try {
                windowManager.removeView(pill);
            } catch (Exception ignored) {
                // already detached
            }
        }
        pill = null;
        stopping = false;
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
        syncStopButton();
    }

    /** Plan A fallback: hide while a capture runs, when the layer cannot opt out. */
    public static synchronized void setSuppressed(boolean value) {
        suppressed = value;
        applyVisibility();
        syncStopButton();
    }

    private static void applyVisibility() {
        if (pill == null) {
            return;
        }
        // A surface that opts out of captures stays visible; otherwise hide it.
        boolean hide = !showEnabled || (suppressed && !pill.hiddenFromCapture);
        pill.setVisibility(hide ? View.GONE : View.VISIBLE);
    }

    /**
     * Put the stop control on screen, take it off, or keep it out of the way.
     *
     * The control lives in a window of its own rather than on the pill's surface, and that
     * is what makes it safe to have: the pill's window is full-screen and inert on purpose
     * (see {@link #applyTouchTransparency}), so making *it* touchable would put a
     * screen-sized touch target over whatever the user is trying to reach. A window the size
     * of one button can only swallow taps on the button.
     */
    private static void syncStopButton() {
        if (windowManager == null || pill == null || !showEnabled || !stoppable) {
            removeStopButton();
            return;
        }
        Context context = pill.getContext();
        Panel panel = pill.currentPanel();
        if (context == null || panel == null) {
            return;
        }
        if (stopButton == null) {
            stopButton = buildStopButton(context);
            stopParams = stopButtonParams(panel);
            try {
                windowManager.addView(stopButton, stopParams);
            } catch (Exception error) {
                stopButton = null;
                stopParams = null;
                Log.w(TAG, "could not add the stop control: " + error);
                return;
            }
        } else {
            placeStopButton(panel);
        }
        if (stopping && !stopButton.stopping) {
            stopButton.setStopping(true);
        }
    }

    private static WindowManager.LayoutParams stopButtonParams(Panel panel) {
        WindowManager.LayoutParams target = new WindowManager.LayoutParams(
                Math.round(panel.buttonWidth),
                Math.round(panel.buttonHeight),
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE,
                // Touchable, unlike the pill: this window *is* the control. NOT_TOUCH_MODAL
                // keeps every touch outside its rect going to the window behind it.
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        target.gravity = Gravity.TOP | Gravity.START;
        target.x = Math.round(panel.buttonLeft);
        target.y = Math.round(panel.buttonTop);
        // Opaque, unlike the pill: the obscuring rule is about touches aimed at windows
        // *below* an untrusted one, and the only window below this one in its own rect is
        // the pill's inert surface. A stop button the user has to squint at is not a button.
        target.alpha = 1f;
        return target;
    }

    private static void placeStopButton(Panel panel) {
        if (stopParams == null || stopButton == null || windowManager == null) {
            return;
        }
        int x = Math.round(panel.buttonLeft);
        int y = Math.round(panel.buttonTop);
        if (stopParams.x == x && stopParams.y == y
                && stopParams.width == Math.round(panel.buttonWidth)) {
            return;
        }
        stopParams.x = x;
        stopParams.y = y;
        stopParams.width = Math.round(panel.buttonWidth);
        stopParams.height = Math.round(panel.buttonHeight);
        try {
            windowManager.updateViewLayout(stopButton, stopParams);
        } catch (Exception ignored) {
            // the view is being detached
        }
    }

    private static void removeStopButton() {
        if (windowManager != null && stopButton != null) {
            try {
                windowManager.removeView(stopButton);
            } catch (Exception ignored) {
                // already detached
            }
        }
        stopButton = null;
        stopParams = null;
    }

    /**
     * The stop control: a real view, so it can be pressed, focused and read out loud.
     *
     * Sized and placed by {@link Panel}, which is also what reserves its space in the card,
     * so the two cannot drift apart.
     */
    private static StopView buildStopButton(Context context) {
        return new StopView(context);
    }

    /**
     * Ask the service to stop the run in flight, and say so on the panel.
     *
     * The runner reports "stopped" a moment later, and until then a tap that changed
     * nothing on screen reads as a control that does not work — so the label switches to
     * "Stopping…" and the button stops accepting taps.
     */
    private static void requestStop(Context context) {
        if (stopping) {
            return;
        }
        stopping = true;
        if (stopButton != null) {
            stopButton.setStopping(true);
        }
        if (pill != null) {
            pill.invalidateVisuals();
        }
        try {
            AgentService.start(context, AgentService.ACTION_STOP, null);
        } catch (RuntimeException error) {
            Log.w(TAG, "could not ask the service to stop the run: " + error);
        }
    }



    /**
     * Make the layer incapable of receiving input, and incapable of shadowing it.
     *
     * Two separate platform rules have to be satisfied, and only the first one is
     * about the window flags:
     *
     * 1. Touchability. Written as an allow-list rather than `|= FLAG_NOT_TOUCHABLE`,
     *    because a ROM or the window type can add flags of its own. Nothing here is
     *    interactive (there is no touch listener anywhere in this class), so the
     *    layer is safe to make inert. `FLAG_NOT_TOUCH_MODAL` is set as well: it is
     *    the flag that says "route touches outside me to the window behind", which
     *    is what this layer wants.
     *
     * 2. Obscuring opacity — this is the one that actually broke the Huawei head
     *    unit. Since Android 12 an untrusted window (ours: `trustedOverlay=false`)
     *    whose alpha exceeds `maximum_obscuring_opacity_for_touch` (0.8 by default)
     *    counts as obscuring, and touches aimed at the windows *below* it are
     *    dropped. `FLAG_NOT_TOUCHABLE` does not exempt a window from that check, and
     *    `FLAG_NOT_TOUCH_MODAL` is not the culprit either — both were measured on
     *    the device. What it looked like from the driver's seat: with the layer up,
     *    taps on another app's window were swallowed, while the car dock and the
     *    navigation bar (system windows above us) and our own console (same UID)
     *    kept working — the "everything is dead except the dock" report. Disabling
     *    the rule with `block_untrusted_touches=0` restored the same taps, which is
     *    what pinned it to this mechanism.
     *
     * So the window alpha is not a style choice here, it is the safety control:
     * {@link #obscuringSafeAlpha} derives it from the device's own threshold. The
     * cost is that the layer composites slightly transparent instead of fully
     * opaque; it is drawn dark-on-dark and stays readable.
     */
    private static void applyTouchTransparency(WindowManager.LayoutParams target) {
        target.flags &= ~(WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
                | WindowManager.LayoutParams.FLAG_SPLIT_TOUCH);
        target.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
        target.alpha = safeAlpha;
    }

    /**
     * Window alpha that keeps the layer's *combined* obscuring opacity below the
     * platform threshold, read from the device so an OEM that changed it is still
     * respected.
     */
    private static float obscuringSafeAlpha(Context context) {
        float max = DEFAULT_MAX_OBSCURING_OPACITY;
        try {
            max = Settings.Global.getFloat(context.getContentResolver(),
                    SETTING_MAX_OBSCURING_OPACITY, DEFAULT_MAX_OBSCURING_OPACITY);
        } catch (Throwable ignored) {
            // Missing or unreadable: the platform default is the safe assumption.
        }
        return obscuringSafeAlpha(max, OBSCURING_WINDOWS);
    }

    /**
     * The per-window alpha whose accumulated opacity across `windows` windows stays
     * under `threshold`, with headroom. Pure so it can be unit tested.
     *
     * Safety wins over legibility: on a device that asks for an alpha so low the
     * layer is barely visible, it still gets one, because the alternative is a layer
     * that silently swallows every tap aimed at the app underneath. The platform
     * default of 0.8 yields ~0.51.
     */
    static float obscuringSafeAlpha(float threshold, int windows) {
        float bounded = Math.max(0.05f, Math.min(threshold, 1f));
        float target = bounded * (1f - OBSCURING_HEADROOM);
        int count = Math.max(1, windows);
        // Solve 1 - (1 - alpha)^n = target for alpha.
        float alpha = 1f - (float) Math.pow(1f - target, 1.0 / count);
        return Math.max(0.01f, Math.min(alpha, 0.99f));
    }

    /** Turn the layer on or off; off removes the window entirely. */
    public static synchronized void setShowEnabled(boolean enabled, Context context) {
        showEnabled = enabled;
        if (!enabled) {
            hide();
            return;
        }
        if (context != null) {
            show(context, lastText);
        }
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
            // Re-assert before every push: this is the one place the flags could
            // drift without anyone noticing.
            applyTouchTransparency(params);
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

    /**
     * The stop control: its own surface, its own window, one tap target.
     *
     * A surface rather than a styled `TextView` because of what the pill learned the hard
     * way: only a surface we own can be marked `setSkipScreenshot`, and a capture that
     * contains our controls is a capture the agent then reasons about (measured: the
     * button showed up in one of a run's own screenshots before this). The fallback for a
     * device without the hidden API is the same as the pill's — hide around captures —
     * which is why this is a SurfaceView and not a plain view.
     */
    private static final class StopView extends SurfaceView implements SurfaceHolder.Callback {

        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint label = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final float density = getResources().getDisplayMetrics().density;
        private boolean pressed;
        private boolean stopping;
        private String text;

        StopView(Context context) {
            super(context);
            text = context.getString(R.string.progress_stop);
            label.setColor(Color.WHITE);
            label.setTextSize(11.5f * density);
            label.setFakeBoldText(true);
            label.setTextAlign(Paint.Align.CENTER);
            setZOrderOnTop(true);
            setZOrderMediaOverlay(true);
            getHolder().setFormat(PixelFormat.TRANSLUCENT);
            getHolder().addCallback(this);
            setWillNotDraw(true);
        }

        void setStopping(boolean value) {
            stopping = value;
            text = getContext().getString(
                    value ? R.string.progress_phase_stopping : R.string.progress_stop);
            render();
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    pressed = true;
                    render();
                    return true;
                case MotionEvent.ACTION_UP:
                    pressed = false;
                    render();
                    if (!stopping && event.getX() >= 0 && event.getX() <= getWidth()
                            && event.getY() >= 0 && event.getY() <= getHeight()) {
                        requestStop(getContext());
                    }
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    pressed = false;
                    render();
                    return true;
                default:
                    return super.onTouchEvent(event);
            }
        }

        private void render() {
            SurfaceHolder holder = getHolder();
            Canvas canvas;
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
                float radius = height / 2f;
                fill.setColor(!stopping && pressed ? 0xFFB3261E : (stopping ? 0xFF6B7280 : FAIL_COLOR));
                canvas.drawRoundRect(new RectF(0f, 0f, width, height), radius, radius, fill);
                Paint.FontMetrics font = label.getFontMetrics();
                canvas.drawText(text, width / 2f,
                        height / 2f - (font.ascent + font.descent) / 2f, label);
            } finally {
                holder.unlockCanvasAndPost(canvas);
            }
        }

        @Override
        public void surfaceCreated(SurfaceHolder holder) {
            applySkipScreenshot(getSurfaceControl());
            render();
        }

        @Override
        public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            render();
        }

        @Override
        public void surfaceDestroyed(SurfaceHolder holder) {
        }

        @Override
        protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            post(this::render);
        }
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
            if (runStartedAt <= 0) {
                // No run clock yet (provisioning reports none): the event's own text is
                // all there is, and it is short by construction.
                return frozenMetrics;
            }
            return ProgressText.duration(System.currentTimeMillis() - runStartedAt);
        }

        /**
         * The geometry the control is drawn with, so the stop window can be placed against
         * the very same box instead of a second copy of the arithmetic.
         */
        Panel currentPanel() {
            int width = getWidth();
            if (width <= 0) {
                return null;
            }
            return new Panel(width, systemInsetTop, density);
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
         * words, and the timings — on two rows inside a fixed-size card.
         *
         * It sits *below* the system status bar and is a constant box, so nothing on it
         * moves while the text underneath it changes; the stop control is a view in its own
         * window, positioned by {@link Panel}, so it lines up with the gap left for it here.
         */
        private void drawBar(Canvas canvas, int width, int height) {
            float pad = Panel.PAD_DP * density;
            float dotSize = 7 * density;
            float dotGap = 8 * density;
            float rowHeight = Panel.ROW_HEIGHT_DP * density;
            float chipGap = 8 * density;
            boolean hasDetail = !detail.isEmpty();

            Panel panel = new Panel(width, systemInsetTop, density);
            RectF card = new RectF(
                    panel.left, panel.top, panel.left + panel.width, panel.top + panel.height);

            // Dark glass, rounded on every corner: the same language as the border streak.
            float corner = 16 * density;
            Paint panelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            panelPaint.setShader(new LinearGradient(0, card.top, 0, card.bottom,
                    0xF20E141C, 0xE60B0F15, Shader.TileMode.CLAMP));
            canvas.drawRoundRect(card, corner, corner, panelPaint);
            Paint hairline = new Paint(Paint.ANTI_ALIAS_FLAG);
            hairline.setStyle(Paint.Style.STROKE);
            hairline.setStrokeWidth(1.2f * density);
            hairline.setColor((BEAM_COLOR & 0x00FFFFFF) | 0x44 << 24);
            canvas.drawRoundRect(card, corner, corner, hairline);

            float innerLeft = panel.innerLeft(density);
            float innerRight = panel.textRight(density);
            float centerY = panel.rowCenterY(density);
            String liveMetrics = liveMetrics();

            // The timings are right-aligned, so they are measured first and everything on
            // that row fits beside them.
            CharSequence metricsText = ellipsize(liveMetrics, metricsPaint, (innerRight - innerLeft) * 0.45f);
            float metricsWidth = metricsPaint.measureText(metricsText, 0, metricsText.length());
            float row1Right = innerRight - (metricsWidth > 0 ? metricsWidth + 12 * density : 0);

            // Same for the chip: measure it before fitting the label that precedes it.
            float chipWidth = stepChip.isEmpty() ? 0 : chipPaint.measureText(stepChip) + 14 * density;
            float phaseGap = chipWidth > 0 ? chipGap : 0;
            float textLeft = innerLeft + dotSize + dotGap;
            float phaseSpace = row1Right - textLeft - chipWidth - phaseGap;
            // While stopping, the label says so: the runner's own "stopped" line can be a
            // second away, and until then the tap would look like it did nothing.
            CharSequence phaseText = ellipsize(
                    stopping ? ProgressText.phaseLabel("stopping") : phase, titlePaint, phaseSpace);
            float phaseWidth = titlePaint.measureText(phaseText, 0, phaseText.length());

            int accent = stopping ? FAIL_COLOR : stateColor();
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

            // The second row is drawn even when it is empty, so the card's height — and
            // with it the stop control's position — never depends on the step text.
            if (hasDetail) {
                CharSequence detailText = ellipsize(detail, detailPaint, card.width() - 2 * pad);
                canvas.drawText(detailText, 0, detailText.length(), innerLeft,
                        panel.detailCenterY(density) - centered(detailPaint), detailPaint);
            }
            // The stop control itself is a view in its own window, placed by Panel into the
            // space this row leaves for it; nothing to draw here.
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
     *
     * Suppressed on purpose, and only here: this is the whole reason the overlay is a
     * SurfaceView rather than a Compose window, the call is wrapped in reflection that
     * returns false on any failure, and the README documents the fallback (hide around
     * screenshots) for builds where the hidden API is unavailable.
     */
    @SuppressLint("BlockedPrivateApi")
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
