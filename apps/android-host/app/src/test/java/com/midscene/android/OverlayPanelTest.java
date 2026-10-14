package com.midscene.android;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * The progress panel's geometry.
 *
 * The panel used to be sized to its content, and its content ticks: the timings go from
 * "9s" to "10s", a step description arrives, the next one is shorter. Every one of those
 * changed the card's width and its centred position, so the panel visibly twitched for the
 * whole run — and a stop control inside it would have moved with it. These tests pin the
 * two properties that fix that: the box is a function of the screen alone, and the control
 * stays inside the box it was reserved in.
 */
public class OverlayPanelTest {

    /** A 1080x2340 phone at 3x, status bar 66px. */
    private static final int SCREEN = 1080;
    private static final int INSET = 66;
    private static final float DENSITY = 3f;
    /** A 800x1280 tablet at 2x. */
    private static final int TABLET = 1600;

    @Test
    public void theBoxDependsOnTheScreenAndNotOnWhatItSays() {
        OverlayView.Panel phone = new OverlayView.Panel(SCREEN, INSET, DENSITY);
        // Same screen, insets and density — nothing else goes into it, so no amount of
        // "Step 12.4s · Total 3m20s" can resize the card.
        OverlayView.Panel again = new OverlayView.Panel(SCREEN, INSET, DENSITY);

        assertEquals(phone.left, again.left, 0.01f);
        assertEquals(phone.width, again.width, 0.01f);
        assertEquals(phone.height, again.height, 0.01f);
        assertEquals(phone.buttonLeft, again.buttonLeft, 0.01f);
        assertEquals(phone.buttonTop, again.buttonTop, 0.01f);
        // A fixed width, and a height that reserves both rows whether they are filled or not.
        assertEquals(OverlayView.Panel.WIDTH_DP * DENSITY, phone.width, 0.01f);
        assertTrue("the second row is part of the box",
                phone.height >= (OverlayView.Panel.ROW_HEIGHT_DP
                        + OverlayView.Panel.DETAIL_HEIGHT_DP) * DENSITY);
    }

    @Test
    public void thePanelIsCentredAndStaysOnScreen() {
        OverlayView.Panel phone = new OverlayView.Panel(SCREEN, INSET, DENSITY);
        assertEquals(SCREEN / 2f, phone.left + phone.width / 2f, 0.01f);
        assertTrue(phone.left >= 0f);
        assertTrue(phone.left + phone.width <= SCREEN);
        // Below the status bar, never behind the clock.
        assertTrue(phone.top > INSET);
    }

    @Test
    public void aNarrowScreenGetsMarginsRatherThanOverflow() {
        // A small phone at a high density: the panel has to shrink to the screen.
        OverlayView.Panel small = new OverlayView.Panel(720, 48, 3f);
        assertTrue(small.width > 0f);
        assertTrue(small.left >= 0f);
        assertTrue(small.left + small.width <= 720);
    }

    @Test
    public void theStopControlSitsInsideTheFirstRowItWasReservedIn() {
        OverlayView.Panel phone = new OverlayView.Panel(SCREEN, INSET, DENSITY);
        float rowTop = phone.top + OverlayView.Panel.PAD_DP * DENSITY;
        float rowCenter = rowTop + OverlayView.Panel.ROW_HEIGHT_DP * DENSITY / 2f;

        assertTrue("inside the card horizontally",
                phone.buttonLeft >= phone.left
                        && phone.buttonRight(DENSITY) <= phone.left + phone.width);
        assertTrue("inside the card vertically",
                phone.buttonTop >= phone.top
                        && phone.buttonTop + phone.buttonHeight <= phone.top + phone.height);
        // Centred on the row it belongs to: taller than the row's text band by design (a
        // 19dp button is not a tap target), which the card's padding absorbs.
        assertEquals(rowCenter, phone.buttonTop + phone.buttonHeight / 2f, 0.5f);
        // And the text column stops before the control, so nothing is drawn underneath it.
        assertTrue(phone.textRight(DENSITY) <= phone.buttonLeft);
        assertTrue(phone.textRight(DENSITY) > phone.innerLeft(DENSITY));
    }

    @Test
    public void theControlIsBigEnoughToHitAndTheTextRowIsStillUsable() {
        OverlayView.Panel phone = new OverlayView.Panel(SCREEN, INSET, DENSITY);
        assertTrue("a tap target of at least 44dp wide",
                phone.buttonWidth >= 44f * DENSITY);
        assertTrue("and 24dp tall", phone.buttonHeight >= 24f * DENSITY);
        // The first row has to hold, in this order: dot (7dp) + gap (8dp) + phase label
        // (~52dp for "Starting") + gap (8dp) + the counter chip (~34dp) + gap (8dp) + the
        // run's clock (~30dp for "1:04"). 150dp is that budget with the longest of the
        // short labels, so a compact row still reads in both languages.
        float textColumn = phone.textRight(DENSITY) - phone.innerLeft(DENSITY);
        assertTrue("room for label, counter and clock", textColumn >= 150f * DENSITY);
        // Compact: no wider than the content-sized card it replaced could get.
        assertTrue("the panel stays narrow", phone.width <= 300f * DENSITY);
    }

    @Test
    public void aWideScreenKeepsThePanelAtItsReadingWidth() {
        OverlayView.Panel tablet = new OverlayView.Panel(TABLET, 48, 2f);
        assertEquals(OverlayView.Panel.WIDTH_DP * 2f, tablet.width, 0.01f);
        assertEquals(TABLET / 2f, tablet.left + tablet.width / 2f, 0.01f);
    }
}
