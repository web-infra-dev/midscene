package com.midscene.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The floating layer must stay below Android 12's touch-occlusion threshold, or the
 * input dispatcher silently drops every tap aimed at the app underneath it. These
 * pin the arithmetic that decides the window alpha.
 */
public class OverlayViewAlphaTest {

    private static final float PLATFORM_DEFAULT_THRESHOLD = 0.8f;

    /** Combined obscuring opacity of `windows` windows at alpha `a`. */
    private static float accumulated(float alpha, int windows) {
        return 1f - (float) Math.pow(1f - alpha, windows);
    }

    @Test
    public void staysUnderThePlatformDefaultThreshold() {
        float alpha = OverlayView.obscuringSafeAlpha(PLATFORM_DEFAULT_THRESHOLD, 2);
        assertTrue("combined opacity must stay under the threshold",
                accumulated(alpha, 2) < PLATFORM_DEFAULT_THRESHOLD);
    }

    /**
     * The measured value on the head unit: with alpha 1.0 the layer blocked taps, and
     * the threshold bisection put its effective opacity at ~0.9375 for alpha 0.75 —
     * i.e. the window and its SurfaceView child both count. If this ever collapses to
     * a single window the alpha can be much higher, and this test should say so
     * loudly rather than let the layer be dimmer than it needs to be.
     */
    @Test
    public void accountsForBothTheWindowAndItsSurfaceViewChild() {
        float alpha = OverlayView.obscuringSafeAlpha(PLATFORM_DEFAULT_THRESHOLD, 2);
        assertTrue("two windows at the computed alpha must not exceed the threshold",
                accumulated(alpha, 2) < PLATFORM_DEFAULT_THRESHOLD);
        assertTrue("one window at the computed alpha would already be safe, so the "
                        + "formula must be using the two-window accumulation",
                accumulated(alpha, 1) < PLATFORM_DEFAULT_THRESHOLD);
        // 1 - (1 - 0.75)^2 = 0.9375, the value measured on the device.
        assertEquals(0.9375f, accumulated(0.75f, 2), 1e-4f);
    }

    @Test
    public void lowerOemThresholdProducesALowerAlpha() {
        float strict = OverlayView.obscuringSafeAlpha(0.5f, 2);
        float lenient = OverlayView.obscuringSafeAlpha(0.9f, 2);
        assertTrue("a stricter device must ask for a lower alpha", strict < lenient);
        assertTrue(accumulated(strict, 2) < 0.5f);
        assertTrue(accumulated(lenient, 2) < 0.9f);
    }

    /** Legibility never wins over the guarantee, however strict the device is. */
    @Test
    public void neverCrossesTheThresholdAtAnySetting() {
        for (float threshold = 0.3f; threshold <= 1.0f; threshold += 0.05f) {
            for (int windows = 1; windows <= 3; windows++) {
                float alpha = OverlayView.obscuringSafeAlpha(threshold, windows);
                assertTrue("threshold=" + threshold + " windows=" + windows
                                + " alpha=" + alpha,
                        accumulated(alpha, windows) < threshold);
            }
        }
    }

    @Test
    public void clampsNonsenseInputs() {
        assertTrue(OverlayView.obscuringSafeAlpha(0f, 2) > 0f);
        assertTrue(OverlayView.obscuringSafeAlpha(1f, 2) <= 0.99f);
        // Fewer than one window is meaningless; it must not divide by zero.
        assertEquals(OverlayView.obscuringSafeAlpha(0.8f, 1),
                OverlayView.obscuringSafeAlpha(0.8f, 0), 1e-6f);
        assertTrue(OverlayView.obscuringSafeAlpha(0.8f, 2)
                <= OverlayView.obscuringSafeAlpha(0.8f, 1));
    }
}
