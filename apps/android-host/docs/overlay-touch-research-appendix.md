# Why a `FLAG_NOT_TOUCHABLE` full-screen overlay can swallow every tap
### AOSP input-dispatch semantics, source-quoted · research date 2026-09-13

Scope: Android 10/11 (`android11-release`), 12 (`android12-release`), 13 (`android13-release`), and current AOSP (`main`), plus the official Android 12 behaviour-change documentation. Every code quote below was fetched from `android.googlesource.com` (line numbers are from the branch head as fetched on 2026-09-13; they drift, the function names do not).

---

## 0. Verdict first

| # | Hypothesis | Explains "physical + `adb input tap` both swallowed, keys still work"? | Confidence |
|---|---|---|---|
| **1** | **Android 12+ "block untrusted touches"** (AOSP, no OEM code needed). The overlay is a *system alert window* (`TYPE_APPLICATION_OVERLAY`/`TYPE_PHONE`), so its `TouchOcclusionMode` is `USE_OPACITY`; its `LayoutParams.alpha` defaults to **1.0** (`PixelFormat.TRANSLUCENT` does **not** count), which is above the default max obscuring opacity **0.8**; it is from a different UID than the window underneath and is **not** a trusted overlay; its **frame** covers the touch point. `InputDispatcher` therefore sets `newTouchedWindowHandle = nullptr` and drops the gesture. `NOT_TOUCHABLE` is *not* an exemption (only `alpha == 0` is). Injected events (`adb shell input tap`) go through the **same** code path. | **YES — fully, on API 31+** | **High** (source + official docs) |
| **2** | **OEM (EMUI/HarmonyOS) launcher mask window** — e.g. `LauncherSmartDockFullScreenMaskWindow` raised by the launcher, or a Huawei-proprietary overlay/touch policy. | Plausible, but only needed if the device is API 29/30 (where stock AOSP provably cannot swallow the touch) or if #1 is ruled out by the `block_untrusted_touches` / `am compat disable` test. **Huawei's own developer FAQ explains this exact symptom as the Android 12 rule**, not as an EMUI mask (§7.1). | Low; the three window names have **zero** public evidence (§7) |
| **3** | Touch-modal misconfiguration (`FLAG_NOT_FOCUSABLE`/`FLAG_NOT_TOUCH_MODAL` cleared) | Would swallow everything, but the reported flag set has `FLAG_NOT_FOCUSABLE`, which *implies* `NOT_TOUCH_MODAL`, so not this — **unless** a different window of the same app or an OEM rewrite drops it. | Low |
| **4** | `FLAG_WATCH_OUTSIDE_TOUCH` | Cannot swallow: the window is only added as an `OUTSIDE` target and the search for the real touched window continues. | Ruled out |
| **5** | `FLAG_LAYOUT_NO_LIMITS` / full-display size by itself | Cannot swallow by itself, but it *widens the frame to the whole display* (including system-bar/dock strips), which is what makes hypothesis #1 cover 100 % of the screen. | Contributory |

**One-line answer:** on Android 12+ a full-screen, fully-opaque, untrusted `SYSTEM_ALERT_WINDOW` overlay is *designed* to block touches that pass through it — `FLAG_NOT_TOUCHABLE` only means "this window is not itself a touch target", it does **not** mean "touches pass through me". This is exactly the Android 12 "Untrusted touch events are blocked" feature, it is on by default, and it applies to injected events too.

---

## 1. How the Java flags reach the dispatcher

The flag word the app passes is copied into the input window and finally into `InputWindowInfo`:

`frameworks/base/services/core/java/com/android/server/wm/InputMonitor.java` (android12-release, `populateInputWindowHandle`, ~line 303):
```java
        final int flags = w.getSurfaceTouchableRegion(mTmpRegion, w.mAttrs.flags);
        inputWindowHandle.setTouchableRegion(mTmpRegion);
        inputWindowHandle.setLayoutParamsFlags(flags);
```
and `.../WindowState.java` (android12-release, `getSurfaceTouchableRegion`, line 2809):
```java
    int getSurfaceTouchableRegion(Region region, int flags) {
        final boolean modal = (flags & (FLAG_NOT_TOUCH_MODAL | FLAG_NOT_FOCUSABLE)) == 0;
        if (modal) {
            flags |= FLAG_NOT_TOUCH_MODAL;
```

Native side, `frameworks/native/include/input/InputWindow.h` (android12-release, line 45):
```cpp
    // Window flags from WindowManager.LayoutParams
    enum class Flag : uint32_t {
        ...
        NOT_FOCUSABLE = 0x00000008,
        NOT_TOUCHABLE = 0x00000010,
        NOT_TOUCH_MODAL = 0x00000020,
        ...
        WATCH_OUTSIDE_TOUCH = 0x00040000,
```
In Android 13+ these moved into a public AIDL enum, `frameworks/native/libs/input/android/os/InputConfig.aidl`.

Two fields matter for everything below (android12-release `include/input/InputWindow.h`, ~line 164):
```cpp
    // The opacity of this window, from 0.0 to 1.0 (inclusive).
    // An alpha of 1.0 means fully opaque and 0.0 means fully transparent.
    float alpha;
    ...
    Region touchableRegion;
    bool visible = false;
    ...
    bool trustedOverlay = false;
    TouchOcclusionMode touchOcclusionMode = TouchOcclusionMode::BLOCK_UNTRUSTED;
```

---

## 2. Q1 — How `NOT_TOUCHABLE` windows are treated by `InputDispatcher`

### 2.1 They are skipped as **touch targets** — completely

Android 12, `frameworks/native/services/inputflinger/dispatcher/InputDispatcher.cpp`, `InputDispatcher::findTouchedWindowAtLocked()` (line 993, the function called by `findTouchedWindowTargetsLocked()` to pick the target of a new gesture):
```cpp
    // Traverse windows from front to back to find touched window.
    const std::vector<sp<InputWindowHandle>>& windowHandles = getWindowHandlesLocked(displayId);
    for (const sp<InputWindowHandle>& windowHandle : windowHandles) {
        ...
        const InputWindowInfo* windowInfo = windowHandle->getInfo();
        if (windowInfo->displayId == displayId) {
            auto flags = windowInfo->flags;

            if (windowInfo->visible) {
                if (!flags.test(InputWindowInfo::Flag::NOT_TOUCHABLE)) {
                    bool isTouchModal = !flags.test(InputWindowInfo::Flag::NOT_FOCUSABLE) &&
                            !flags.test(InputWindowInfo::Flag::NOT_TOUCH_MODAL);
                    if (isTouchModal || windowInfo->touchableRegionContainsPoint(x, y)) {
                        ...
                        // Found window.
                        return windowHandle;
                    }
                }

                if (addOutsideTargets && flags.test(InputWindowInfo::Flag::WATCH_OUTSIDE_TOUCH)) {
                    touchState->addOrUpdateWindow(windowHandle,
                                                  InputTarget::FLAG_DISPATCH_AS_OUTSIDE,
                                                  BitSet32(0));
                }
            }
        }
    }
    return nullptr;
```
Android 11 is identical in substance (`android11-release .../InputDispatcher.cpp`, line ~800):
```cpp
            if (windowInfo->visible) {
                if (!(flags & InputWindowInfo::FLAG_NOT_TOUCHABLE)) {
                    bool isTouchModal = (flags &
                                         (InputWindowInfo::FLAG_NOT_FOCUSABLE |
                                          InputWindowInfo::FLAG_NOT_TOUCH_MODAL)) == 0;
```
Current AOSP factored it into a free function, `main .../InputDispatcher.cpp`, `windowAcceptsTouchAt()` (line 580):
```cpp
bool windowAcceptsTouchAt(const WindowInfo& windowInfo, ui::LogicalDisplayId displayId, float x,
                          float y, bool isStylus, const ui::Transform& displayTransform) {
    const auto inputConfig = windowInfo.inputConfig;
    if (windowInfo.displayId != displayId ||
        inputConfig.test(WindowInfo::InputConfig::NOT_VISIBLE)) {
        return false;
    }
    const bool windowCanInterceptTouch = isStylus && windowInfo.interceptsStylus();
    if (inputConfig.test(WindowInfo::InputConfig::NOT_TOUCHABLE) && !windowCanInterceptTouch) {
        return false;
    }
```

### 2.2 …but they are **still counted as obscuring** — this is the whole ballgame

`NOT_TOUCHABLE` is evaluated in the *hit-testing* pass only. Occlusion is a **separate** pass that iterates the same front-to-back window list and only asks: is the window visible, does its **frame** contain the point, is it from a different UID, is it trusted?

`frameworks/native/libs/input/android/os/InputConfig.aidl` (main, `NOT_TOUCHABLE`) states it in one sentence:
```
    /**
     * Indicates that this input window cannot receive any events directed at a
     * specific location on the screen, such as touchscreen, mouse, and stylus events.
     * The window will not be considered as a touch target, but can still obscure other
     * windows.
     */
    NOT_TOUCHABLE                = 1 << 3,
```

Android 12 `InputDispatcher.cpp`, `canBeObscuredBy()` (line 2509) — the *only* place `NOT_TOUCHABLE` appears in the occlusion logic:
```cpp
static bool canBeObscuredBy(const sp<InputWindowHandle>& windowHandle,
                            const sp<InputWindowHandle>& otherHandle) {
    // Compare by token so cloned layers aren't counted
    if (haveSameToken(windowHandle, otherHandle)) {
        return false;
    }
    auto info = windowHandle->getInfo();
    auto otherInfo = otherHandle->getInfo();
    if (!otherInfo->visible) {
        return false;
    } else if (otherInfo->alpha == 0 &&
               otherInfo->flags.test(InputWindowInfo::Flag::NOT_TOUCHABLE)) {
        // Those act as if they were invisible, so we don't need to flag them.
        // We do want to potentially flag touchable windows even if they have 0
        // opacity, since they can consume touches and alter the effects of the
        // user interaction (eg. apps that rely on
        // FLAG_WINDOW_IS_PARTIALLY_OBSCURED should still be told about those
        // windows), hence we also check for FLAG_NOT_TOUCHABLE.
        return false;
    } else if (info->ownerUid == otherInfo->ownerUid) {
        // If ownerUid is the same we don't generate occlusion events as there
        // is no security boundary within an uid.
        return false;
    } else if (otherInfo->trustedOverlay) {
        return false;
    } else if (otherInfo->displayId != info->displayId) {
        return false;
    }
    return true;
}
```
(identical logic in main, line 3120, with `NOT_VISIBLE`/`TRUSTED_OVERLAY` in `inputConfig`).

**So: a `NOT_TOUCHABLE` window is exempt from obscuring only when `alpha == 0`.** With `alpha == 1.0` it obscures exactly like a touchable window.

And the frame test — note it is the **frame**, not the touchable region (`frameworks/native/libs/input/InputWindow.cpp`, android12-release, line 40):
```cpp
bool InputWindowInfo::frameContainsPoint(int32_t x, int32_t y) const {
    return x >= frameLeft && x < frameRight
            && y >= frameTop && y < frameBottom;
}
```

The consumer, `InputDispatcher::computeTouchOcclusionInfoLocked()` (android12-release, line 2557):
```cpp
    for (const sp<InputWindowHandle>& otherHandle : windowHandles) {
        if (windowHandle == otherHandle) {
            break; // All future windows are below us. Exit early.
        }
        const InputWindowInfo* otherInfo = otherHandle->getInfo();
        if (canBeObscuredBy(windowHandle, otherHandle) && otherInfo->frameContainsPoint(x, y) &&
            !haveSameApplicationToken(windowInfo, otherInfo)) {
            ...
            if (otherInfo->touchOcclusionMode == TouchOcclusionMode::BLOCK_UNTRUSTED) {
                info.hasBlockingOcclusion = true;
                ...
            }
            if (otherInfo->touchOcclusionMode == TouchOcclusionMode::USE_OPACITY) {
                ...
                opacity = 1 - (1 - opacity) * (1 - otherInfo->alpha);
```

> **Q1 answer:** skipped entirely as touch targets, **but fully able to obscure** (and therefore to block, see §4). The pre-Android-12 `findTouchedWindowTargetsLocked` has no other path by which a `NOT_TOUCHABLE` window can affect touch delivery.

**Version boundary worth stating explicitly.** On Android 11 and lower the *only* consequence of an untrusted window sitting above you was that the event was tagged, not withheld: `android11-release InputDispatcher.cpp` line 2374 still does
```cpp
            if (dispatchEntry->targetFlags & InputTarget::FLAG_WINDOW_IS_OBSCURED) {
                dispatchEntry->resolvedFlags |= AMOTION_EVENT_FLAG_WINDOW_IS_OBSCURED;
            }
```
and the app below received the touch and could choose to ignore it (`View.setFilterTouchesWhenObscured` / `View.onFilterTouchEventForSecurity`). So **on API ≤ 30 the stock AOSP framework cannot swallow the tap for you** — if the head unit is Android 10/11, the cause is OEM-specific (see §7/§10). The blocking behaviour starts with Android 12 (§4).

---

## 3. Q2 — `FLAG_WATCH_OUTSIDE_TOUCH`

Java doc (`frameworks/base/core/java/android/view/WindowManager.java`, android12-release line ~1650 / main line 2917):
```java
        /** Window flag: if you have set {@link #FLAG_NOT_TOUCH_MODAL}, you
         * can set this flag to receive a single special MotionEvent with
         * the action
         * {@link MotionEvent#ACTION_OUTSIDE MotionEvent.ACTION_OUTSIDE} for
         * touches that occur outside of your window.  Note that you will not
         * receive the full down/move/up gesture, only the location of the
         * first down as an ACTION_OUTSIDE.
         */
        public static final int FLAG_WATCH_OUTSIDE_TOUCH = 0x00040000;
```
`InputConfig.aidl` (main):
```
    /**
     * Indicates that this window wants to listen for when there is a touch DOWN event
     * that occurs outside its touchable bounds. When such an event occurs, this window
     * will receive a MotionEvent with ACTION_OUTSIDE.
     */
    WATCH_OUTSIDE_TOUCH          = 1 << 9,
```
Dispatcher behaviour (android12-release, `findTouchedWindowAtLocked`, quoted in full in §2.1): the `WATCH_OUTSIDE_TOUCH` branch sits **outside** the `if (!NOT_TOUCHABLE)` guard, so a `NOT_TOUCHABLE` window carrying the flag **is** added to the touch state — as `InputTarget::FLAG_DISPATCH_AS_OUTSIDE` with an empty pointer-id set — and the loop then **continues** to search for the real touched window below it. In current AOSP it is a separate pass, `InputDispatcher::findOutsideTargetsLocked()` (main, line 1477):
```cpp
        if (windowHandle == touchedWindow) {
            // Stop iterating once we found a touched window. Any WATCH_OUTSIDE_TOUCH window
            // below the touched window will not get ACTION_OUTSIDE event.
            return outsideTargets;
        }
```
> **Q2 answer:** `WATCH_OUTSIDE_TOUCH` never makes a window touchable and never blocks hits to windows below. It only adds an `ACTION_OUTSIDE` delivery to that window for the *first down*. It is **not** a candidate explanation for swallowed taps (and it is not in the reported flag set anyway).

---

## 4. Q3 — Android 12+ "untrusted touch" blocking (the leading explanation)

### 4.1 Official documentation (verbatim)

[developer.android.com/about/versions/12/behavior-changes-all](https://developer.android.com/about/versions/12/behavior-changes-all?hl=en) → *"Untrusted touch events are blocked"*:

> To preserve system security and a good user experience, Android 12 prevents apps from consuming touch events where an overlay obscures the app in an unsafe way. In other words, the system blocks touches that pass through certain windows, with a few exceptions.
>
> **Affected apps**: This change affects apps that choose to let touches pass through their windows, for example by using the `FLAG_NOT_TOUCHABLE` flag. Several examples include, but aren't limited to, the following:
> - Overlays that require the `SYSTEM_ALERT_WINDOW` permission, such as windows that use `TYPE_APPLICATION_OVERLAY`, and use the `FLAG_NOT_TOUCHABLE` flag.
> - Activity windows that use the `FLAG_NOT_TOUCHABLE` flag.
>
> **Exceptions**: In the following cases, "pass-through" touches are allowed:
> - Interactions within your app. Your app shows the overlay, and the overlay appears only when the user is interacting with your app.
> - Trusted windows. These windows include (but aren't limited to) the following: Accessibility windows; Input method editor (IME) windows; Assistant windows. **Note: Windows of type `TYPE_APPLICATION_OVERLAY` aren't trusted.**
> - Invisible windows. The window's root view is `GONE` or `INVISIBLE`.
> - Completely transparent windows. The `alpha` property is 0.0 for the window.
> - Sufficiently translucent system alert windows. The system considers a set of system alert windows to be sufficiently translucent when the combined opacity is less than or equal to the system's maximum obscuring opacity for touches. In Android 12, this maximum opacity is 0.8 by default.
>
> **Detect when an untrusted touch is blocked**: If a touch action is blocked by the system, Logcat logs the following message: `Untrusted touch due to occlusion by PACKAGE_NAME`
>
> **Test the change**: Untrusted touches are blocked by default on devices that run Android 12 or higher. To allow untrusted touches, run the following ADB command in a terminal window:
> ```
> # A specific app
> adb shell am compat disable BLOCK_UNTRUSTED_TOUCHES com.example.app
> # All apps
> # If you'd still like to see a Logcat message warning when a touch would be
> # blocked, use 1 instead of 0.
> adb shell settings put global block_untrusted_touches 0
> ```
> To revert the behavior to the default (untrusted touches are blocked):
> ```
> adb shell am compat disable ... (reset)
> adb shell settings put global block_untrusted_touches 2
> ```

The AOSP javadoc for `FLAG_NOT_TOUCHABLE` carries the same rules (and *is* reproduced verbatim in the public reference: https://developer.android.com/reference/android/view/WindowManager.LayoutParams#FLAG_NOT_TOUCHABLE), and is the most compact "spec" of the feature (`frameworks/base/core/java/android/view/WindowManager.java`, present identically in android12-release line 1656 and main line 2722):
```java
        /**
         * Window flag: this window can never receive touch events.
         *
         * <p>The intention of this flag is to leave the touch to be handled by some window below
         * this window (in Z order).
         *
         * <p>Starting from Android {@link Build.VERSION_CODES#S}, for security reasons, touch
         * events that pass through windows containing this flag (ie. are within the bounds of the
         * window) will only be delivered to the touch-consuming window if one (or more) of the
         * items below are true:
         * <ol>
         *   <li><b>Same UID</b>: ...
         *   <li><b>Trusted windows</b>: ... Windows of
         *   type {@link #TYPE_APPLICATION_OVERLAY} are <b>not</b> trusted, see below.
         *   <li><b>Invisible windows</b>: ...
         *   <li><b>Fully transparent windows</b>: This window has {@link LayoutParams#alpha} equal
         *   to 0.
         *   <li><b>One SAW window with enough transparency</b>: This window is of type {@link
         *   #TYPE_APPLICATION_OVERLAY}, has {@link LayoutParams#alpha} below or equal to the
         *   <a href="#MaximumOpacity">maximum obscuring opacity</a> (see below) ...
         *   <li><b>Multiple SAW windows with enough transparency</b>: ... <b>combined obscuring
         *   opacity</b> below or equal to the maximum obscuring opacity ...
         * </ol>
         * <p>If none of these cases hold, the touch will not be delivered and a message will be
         * logged to logcat.</p>
         * ...
         * <h3>Maximum obscuring opacity</h3>
         * <p>This value is <b>0.8</b>.
```

The official Android Developers blog post that introduced the feature ([*Untrusted Touch Events in Android*, Meghan Mehta, 2021-05-26](https://medium.com/androiddevelopers/untrusted-touch-events-2c0e0b9c374c)) adds three facts that matter for this bug:

> "Specifically, Android 12 prevents touch events from being delivered to apps if these touches pass through a window from a different app. **This behavior change applies to all apps running on Android 12, regardless of `targetSdkVersion`.**"

> "**Unnecessarily large windows** … the solution here is also straightforward … you just need to reduce the window boundaries to the actual UI and use `FLAG_NOT_TOUCH_MODAL`, at which point you probably want to remove `FLAG_NOT_TOUCHABLE` too. Now touches outside your UI will go directly to the window behind and won't be blocked."

> "**Translucent windows** … You'll have to reduce your opacity at the **window level,** merely changing the opacity of views doesn't work. You can use `LayoutParams.alpha` to reduce the opacity to a value below or equal to `InputManager.getMaximumObscuringOpacityForTouch()` …"

The AOSP commit that introduced it (Bernardo Rufino, 2020-08-19, [64bbd4b1](https://android.googlesource.com/platform/frameworks/base/+/64bbd4b1d93a0150b30ebcf84fa21f6d9304ff1c), Bug 158002302) describes the design:

> "The feature is disabled by default and can be in one of 3 modes: disabled, permissive and block. … This knob is implemented in a global setting block_untrusted_touches. It can also be disabled per occluding app using app-compat infrastructure, so if you disable for a certain app, overlays of that app won't have the chance of blocking touches. … Each window has 3 modes related to touch occlusion: ALLOW, USE_OPACITY or BLOCK_UNTRUSTRED. … If the feature is turned off for the app, then the mode is ALLOW. Else if it's a SAW, then it's USE_OPACITY. Else it's BLOCK_UNTRUSTED."

**Note the targetSdk nuance:** the public docs and the blog say the block applies to **all apps** on Android 12+, while the *window-side* mode (`USE_OPACITY` vs `ALLOW`) is still gated per-app by `CompatChanges.isChangeEnabled(BLOCK_UNTRUSTED_TOUCHES, mOwnerUid)` on Android 12 only (§4.2) — i.e. the gate is on the **overlay-owning** app's compat state (`am compat disable … <overlay pkg>`), not on the victim app's `targetSdk`. The user's "targetSdk modern" app is squarely inside the affected set either way.

The AOSP platform documentation repeats it ([source.android.com/docs/core/display → "Block untrusted touches"](https://source.android.com/docs/core/display#block-untrusted)): *"Android 12 prevents apps from consuming touch events where an overlay obscures the app in an unsafe way. In other words, the system blocks touches that pass through certain windows, with a few exceptions."*

### 4.2 Where the window's occlusion mode comes from
`frameworks/base/services/core/java/com/android/server/wm/WindowState.java` (android12-release, line 1158) — **both** `TYPE_APPLICATION_OVERLAY` and `TYPE_PHONE` are "system alert window" types, hence `USE_OPACITY`:
```java
    int getTouchOcclusionMode() {
        if (!CompatChanges.isChangeEnabled(BLOCK_UNTRUSTED_TOUCHES, mOwnerUid)) {
            return TouchOcclusionMode.ALLOW;
        }
        if (WindowManager.LayoutParams.isSystemAlertWindowType(mAttrs.type)) {
            return TouchOcclusionMode.USE_OPACITY;
        }
        if (isAnimating(PARENTS | TRANSITION, ANIMATION_TYPE_ALL)) {
            return TouchOcclusionMode.USE_OPACITY;
        }
        return TouchOcclusionMode.BLOCK_UNTRUSTED;
    }
```
`WindowManager.LayoutParams.isSystemAlertWindowType()` (android12-release line 1595, main line 2662) returns true for `TYPE_PHONE, TYPE_PRIORITY_PHONE, TYPE_SYSTEM_ALERT, TYPE_SYSTEM_ERROR, TYPE_SYSTEM_OVERLAY, TYPE_APPLICATION_OVERLAY`.

Android 13 (`android13-release .../WindowState.java`, line 1239) dropped the per-app compat gate — from 13 on, SAW windows are *always* `USE_OPACITY`:
```java
    int getTouchOcclusionMode() {
        if (WindowManager.LayoutParams.isSystemAlertWindowType(mAttrs.type)) {
            return TouchOcclusionMode.USE_OPACITY;
        }
        if (isAnimating(PARENTS | TRANSITION, ANIMATION_TYPE_ALL) || inTransition()) {
            return TouchOcclusionMode.USE_OPACITY;
        }
        return TouchOcclusionMode.BLOCK_UNTRUSTED;
    }
```
(consequence: the `am compat disable BLOCK_UNTRUSTED_TOUCHES <pkg>` opt-out is only effective on Android 12; on 13+ only the global setting remains, and on 14+ even that is gone.)

Another wrinkle worth knowing when reading the code: `InputDispatcher` *initialises* `mMaximumObscuringOpacityForTouch(1.0f)` (android12-release line 524, android13-release line 552), and the effective 0.8 arrives later when `InputManagerService` pushes the setting (`updateMaximumObscuringOpacityForTouchFromSettings()` → `nativeSetMaximumObscuringOpacityForTouch(mPtr, opacity)`, android12-release line ~1955). If that push never happened (or the setting were set to 1), blocking by opacity would be disabled — one more reason to read `settings get global maximum_obscuring_opacity_for_touch` on the device.

`touchOcclusionMode` semantics (`frameworks/native/libs/input/android/os/TouchOcclusionMode.aidl`, android12-release):
```
    /**
      * Touches that pass through this window will be blocked if they are
      * consumed by a different UID and this window is not trusted.
      */
    BLOCK_UNTRUSTED,
    /**
      * The window's opacity will be taken into consideration for touch
      * occlusion rules if the touch passes through it and the window is not
      * trusted.
      */
    USE_OPACITY,
    /**
      * The window won't count for touch occlusion rules if the touch passes
      * through it.
      */
    ALLOW
```
It is pushed per window in `InputMonitor.populateInputWindowHandle()` (android12-release, line 277): `inputWindowHandle.setTouchOcclusionMode(w.getTouchOcclusionMode());`

**Trusted overlay** is decided in `WindowState`'s constructor (android12-release, line 1074):
```java
        // Check private trusted overlay flag and window type to set trustedOverlay variable of
        // input window handle.
        mInputWindowHandle.setTrustedOverlay(
                ((mAttrs.privateFlags & PRIVATE_FLAG_TRUSTED_OVERLAY) != 0
                        && mOwnerCanAddInternalSystemWindow)
                        || InputMonitor.isTrustedOverlay(mAttrs.type));
```
and the type whitelist (`InputMonitor.java`, line 642) **does not contain `TYPE_APPLICATION_OVERLAY` or `TYPE_PHONE`**:
```java
    static boolean isTrustedOverlay(int type) {
        return type == TYPE_ACCESSIBILITY_MAGNIFICATION_OVERLAY
                || type == TYPE_INPUT_METHOD || type == TYPE_INPUT_METHOD_DIALOG
                || type == TYPE_MAGNIFICATION_OVERLAY || type == TYPE_STATUS_BAR
                || type == TYPE_NOTIFICATION_SHADE
                || type == TYPE_NAVIGATION_BAR
                || type == TYPE_NAVIGATION_BAR_PANEL
                || type == TYPE_SECURE_SYSTEM_OVERLAY
                || type == TYPE_DOCK_DIVIDER
                || type == TYPE_ACCESSIBILITY_OVERLAY
                || type == TYPE_INPUT_CONSUMER
                || type == TYPE_VOICE_INTERACTION;
    }
```
`LayoutParams.setTrustedOverlay()` is `@hide` and requires `INTERNAL_SYSTEM_WINDOW` (android12-release `WindowManager.java` line 3512), so **an ordinary app cannot become a trusted overlay**.

### 4.3 Defaults, settings values, and the "3 = block all" question

* `android.hardware.input.InputManager` (android12-release line 197): `public static final float DEFAULT_MAXIMUM_OBSCURING_OPACITY_FOR_TOUCH = .8f;`
* Same file, line 203: `DEFAULT_BLOCK_UNTRUSTED_TOUCHES_MODE = BlockUntrustedTouchesMode.BLOCK;` — i.e. **blocking is the default.**
* The setting is read in `InputManagerService` and pushed natively (`.../server/input/InputManagerService.java`, android12-release lines 1915-1936): `updateBlockUntrustedTouchesModeFromSettings()` → `nativeSetBlockUntrustedTouchesMode(mPtr, mode)` and `updateMaximumObscuringOpacityForTouchFromSettings()` → `nativeSetMaximumObscuringOpacityForTouch(mPtr, opacity)`.
* `Settings.Global.BLOCK_UNTRUSTED_TOUCHES_MODE = "block_untrusted_touches"` (android12-release `provider/Settings.java` line 16122) documents **only three** values:
```java
         * Can be one of:
         * <ul>
         *      <li>0 = {@link BlockUntrustedTouchesMode#DISABLED}: Feature is off.
         *      <li>1 = {@link BlockUntrustedTouchesMode#PERMISSIVE}: Untrusted touches are flagged
         *          but not blocked
         *      <li>2 = {@link BlockUntrustedTouchesMode#BLOCK}: Untrusted touches are blocked
         * </ul>
```
  and `InputManager.getBlockUntrustedTouchesMode()` (line 986) *rejects* anything else:
```java
        if (!ArrayUtils.contains(BLOCK_UNTRUSTED_TOUCHES_MODES, mode)) {
            Log.w(TAG, "Unknown block untrusted touches feature mode " + mode + ", using "
                    + "default " + DEFAULT_BLOCK_UNTRUSTED_TOUCHES_MODE);
            return DEFAULT_BLOCK_UNTRUSTED_TOUCHES_MODE;
        }
```
  with `BLOCK_UNTRUSTED_TOUCHES_MODES = { DISABLED, PERMISSIVE, BLOCK }` (line 88) and `BlockUntrustedTouchesMode.aidl` = `{DISABLED, PERMISSIVE, BLOCK}`.
  → **In AOSP there is no value 3.** The commonly-cited "0=disabled, 1=permissive, 2=obscured, 3=block all" is *not* an AOSP mapping for this key; the public docs list only `0`, `1`, `2`, and `block_untrusted_touches` does not appear at all in the public [`Settings.Global` reference](https://developer.android.com/reference/android/provider/Settings.Global) (the constant is `@hide`). A device that reports `3` is running an **OEM extension** (Huawei/EMUI is a plausible source — see §7), and stock AOSP's `InputManager` would log `Unknown block untrusted touches feature mode 3` and fall back to `BLOCK`.
* Version drift: `BlockUntrustedTouchesMode.aidl` exists on `android12-release` and `android13-release` and is **gone** from `android14-release`, `android15-release` and `main`; `Settings.Global.BLOCK_UNTRUSTED_TOUCHES_MODE` is gone from `android14-release`/`main` `Settings.java` as well. From Android 14 on, untrusted-touch blocking is unconditional (only `MAXIMUM_OBSCURING_OPACITY_FOR_TOUCH` survives), so the `settings put global block_untrusted_touches 0` workaround **stops working on Android 14+** (the per-app compat id `158002302` still exists in `InputManager`, but the dispatcher no longer consults a mode).

**Threshold nit at exactly 0.8 — don't sit on the boundary.** The dispatcher blocks on a *strict* comparison (`obscuringOpacity > mMaximumObscuringOpacityForTouch`, §4.4) and the `FLAG_NOT_TOUCHABLE` javadoc says "below **or equal to**", so 0.8 exactly should pass; but the official tapjacking page says the opposite — ["for System Alert Window (SAW) and window animations, only touches from layers with opacity **>= 0.8** are blocked"](https://developer.android.com/privacy-and-security/risks/tapjacking). Choose a comfortable margin (e.g. `LayoutParams.alpha = 0.5f`) rather than 0.8 if you rely on this exemption.

### 4.4 What exactly happens to the touch, and why `adb shell input tap` dies too

Android 12 `InputDispatcher::findTouchedWindowTargetsLocked()` (line 1990-2060):
```cpp
        newTouchedWindowHandle =
                findTouchedWindowAtLocked(displayId, x, y, &tempTouchState,
                                          isDown /*addOutsideTargets*/, true /*addPortalWindows*/);
        ...
        // Drop events that can't be trusted due to occlusion
        if (newTouchedWindowHandle != nullptr &&
            mBlockUntrustedTouchesMode != BlockUntrustedTouchesMode::DISABLED) {
            TouchOcclusionInfo occlusionInfo =
                    computeTouchOcclusionInfoLocked(newTouchedWindowHandle, x, y);
            if (!isTouchTrustedLocked(occlusionInfo)) {
                ...
                onUntrustedTouchLocked(occlusionInfo.obscuringPackage);
                if (mBlockUntrustedTouchesMode == BlockUntrustedTouchesMode::BLOCK) {
                    ALOGW("Dropping untrusted touch event due to %s/%d",
                          occlusionInfo.obscuringPackage.c_str(), occlusionInfo.obscuringUid);
                    newTouchedWindowHandle = nullptr;
                }
            }
        }
        ...
        if (newTouchedWindowHandle == nullptr && newGestureMonitors.empty()) {
            ALOGI("Dropping event because there is no touchable window or gesture monitor at "
                  "(%d, %d) in display %" PRId32 ".",
                  x, y, displayId);
            injectionResult = InputEventInjectionResult::FAILED;
            goto Failed;
        }
```
and `isTouchTrustedLocked()` (line 2628):
```cpp
    if (occlusionInfo.obscuringOpacity > mMaximumObscuringOpacityForTouch) {
        ALOGW("Untrusted touch due to occlusion by %s/%d (obscuring opacity = "
              "%.2f, maximum allowed = %.2f)", ...);
        return false;
    }
```
Note the semantics for an **ongoing** gesture: the check runs on the DOWN, the target is never added to the touch state, and subsequent MOVE/UP find `tempTouchState.down == false` → "Dropping event because the pointer is not down or we previously dropped the pointer down event" (line 2095). In current AOSP an already-down gesture is additionally sanitised by `filterUntrustedTargets()` (main, line 771), which erases non-`TRUSTED_OVERLAY` windows from the touch state and from the target list. Net user-visible effect: **the app below never sees the DOWN, so it cannot even show a press state; nothing at all happens.**

**Injected events take the same path.** `InputDispatcher::injectInputEvent()` (android12-release line 3997) ends with
```cpp
    bool needWake = false;
    while (!injectedEntries.empty()) {
        needWake |= enqueueInboundEventLocked(std::move(injectedEntries.front()));
        injectedEntries.pop();
    }
```
so an injected motion event is queued exactly like a device event and goes through `dispatchEventLocked()` → `findTouchedWindowTargetsLocked()`. The only gate on the occlusion check is `mBlockUntrustedTouchesMode != DISABLED`; the `POLICY_FLAG_INJECTED | POLICY_FLAG_TRUSTED` flags set for injections are **not** consulted. `adb shell input tap` therefore gets dropped too, and the injection call returns `FAILED`. (Same in main: the check lives in `canWindowReceiveMotionLocked()`, line 5265, invoked from the common target-selection code at lines 2534/2668.)

### 4.5 Why this overlay's alpha is 1.0 even though it is `PixelFormat.TRANSLUCENT`

The occlusion rule uses the **window alpha**, not the pixel format and not the drawn content's transparency:

* `frameworks/base/core/java/android/view/WindowManager.java`, `LayoutParams`: `public float alpha = 1.0f;` — "An alpha value to apply to this entire window."
* `WindowState` constructor (android12-release line 1135): `mWinAnimator.mAlpha = a.alpha;`
* SurfaceFlinger overwrites the input-window alpha with the layer alpha, `frameworks/native/services/surfaceflinger/Layer.cpp` (android12-release, `Layer::fillInputInfo`, line 2326):
```cpp
    info.visible = hasInputInfo() ? canReceiveInput() : isVisible();
    info.alpha = getAlpha();
    fillTouchOcclusionMode(info);
```
* `Layer.h` (line 750): `// Returns the Alpha of the Surface, accounting for the Alpha of parent Surfaces in the hierarchy (alpha's will be multiplied down the hierarchy).`

So a `SurfaceView` overlay that never touches `LayoutParams.alpha` has input alpha **1.0** regardless of `PixelFormat.TRANSLUCENT` or of how transparent the drawn pixels are. (Two useful corollaries: the overlay only starts occluding once its layer is actually visible to SurfaceFlinger, `info.visible = canReceiveInput() = !isHiddenByPolicy()`, so the symptom can appear only *after* the overlay draws its first frame; and setting `LayoutParams.alpha` dims the drawn content, because alpha multiplies down the layer hierarchy.)

### 4.6 Does `FLAG_NOT_TOUCHABLE` exempt the window from the opacity calculation?

**No.** `canBeObscuredBy()` (§2.2) exempts a window only if it is *both* `NOT_TOUCHABLE` **and** `alpha == 0`. In every other case a non-touchable window contributes its `alpha` to `obscuringOpacity` (if it is a SAW type) or sets `hasBlockingOcclusion` outright (any other type, because `getTouchOcclusionMode()` returns `BLOCK_UNTRUSTED` for non-SAW windows). The official docs say the same in the "Exceptions" list: the pass-through exceptions are same-UID, trusted, invisible, alpha 0.0, and *sufficiently translucent* (≤ 0.8) — **not** `FLAG_NOT_TOUCHABLE`.

> **Q3 answer:** yes — an untrusted full-screen overlay from a different UID causes touches aimed at the app **below** to be dropped (DOWN never delivered; gesture dead), and it also kills `adb shell input tap`. `FLAG_NOT_TOUCHABLE` does not exempt a window from the obscuring-opacity calculation; only `alpha == 0`, same-UID, invisibility, trusted-overlay status, or (for SAW types) combined opacity ≤ 0.8 do.

---

## 5. Q4 — `FLAG_NOT_TOUCH_MODAL` and "touch-modal" windows

Java docs (`WindowManager.java`, android12-release / main):
```java
        /** Window flag: this window won't ever get key input focus ...
         * This flag will also enable {@link #FLAG_NOT_TOUCH_MODAL} whether or not that
         * is explicitly set. */
        public static final int FLAG_NOT_FOCUSABLE      = 0x00000008;

        /** Window flag: even when this window is focusable (its
         * {@link #FLAG_NOT_FOCUSABLE} is not set), allow any pointer events
         * outside of the window to be sent to the windows behind it.  Otherwise
         * it will consume all pointer events itself, regardless of whether they
         * are inside of the window. */
        public static final int FLAG_NOT_TOUCH_MODAL    = 0x00000020;
```
Two independent mechanisms make a touch-modal window swallow everything:

1. **Dispatchers ≤ Android 13** short-circuit the touchable region for touch-modal windows (android12-release `InputDispatcher.cpp` line 1014, quoted in §2.1):
   `bool isTouchModal = !NOT_FOCUSABLE && !NOT_TOUCH_MODAL; if (isTouchModal || touchableRegionContainsPoint(x, y)) { return windowHandle; }`
   → any point on the display is "inside" the window, regardless of its touchable region.
2. **WMS hands touch-modal windows a 3×-display touchable region** (`WindowState.getSurfaceTouchableRegion()`, android12-release line 2809):
```java
        final boolean modal = (flags & (FLAG_NOT_TOUCH_MODAL | FLAG_NOT_FOCUSABLE)) == 0;
        if (modal) {
            flags |= FLAG_NOT_TOUCH_MODAL;
            ...
                // Give it a large touchable region at first because it was touch modal. The window
                // might be moved on the display, so the touchable region should be large enough to
                // ensure it covers the whole display, no matter where it is moved.
                getDisplayContent().getBounds(mTmpRect);
                final int dw = mTmpRect.width();
                final int dh = mTmpRect.height();
                region.set(-dw, -dh, dw + dw, dh + dh);
```
   and `getEffectiveTouchableRegion()` (line 3687) does the same for querying. Current AOSP dropped the dispatcher-side `isTouchModal` shortcut entirely (no occurrence of "isTouchModal" in `main`'s `InputDispatcher.cpp`) and relies on this region.

> **Q4 answer:** yes — a **full-screen touch-modal** window (i.e. one that has neither `FLAG_NOT_TOUCH_MODAL` nor `FLAG_NOT_FOCUSABLE`) blocks/consumes pointer events everywhere, by design. In the reported configuration `FLAG_NOT_FOCUSABLE` **is** set, which the docs say *implies* `FLAG_NOT_TOUCH_MODAL`, so the window is not touch-modal. The only way this mechanism could be the culprit is if the effective flag word in `dumpsys input` shows `NOT_FOCUSABLE|NOT_TOUCH_MODAL` missing — e.g. an OEM re-adding the window with different flags, or a second window of the same app.

---

## 6. Q5 — `FLAG_LAYOUT_NO_LIMITS` and full-display sizing

* Doc (`WindowManager.java`): `/** Window flag: allow window to extend outside of the screen. */ public static final int FLAG_LAYOUT_NO_LIMITS = 0x00000200;` and `FLAG_LAYOUT_IN_SCREEN`: "Place the window within the entire screen, ignoring any constraints from the parent window."
* Neither flag is read anywhere in `InputDispatcher` (they only exist as bits in `InputWindowInfo::Flag`); input sees only `frame`, `touchableRegion`, `flags`, `alpha`, `visible`, `trustedOverlay`, `touchOcclusionMode`, `displayId`. So **`FLAG_LAYOUT_NO_LIMITS` has zero direct effect on touch dispatch**.
* Its *indirect* effect matters for this bug: it (with `FLAG_LAYOUT_IN_SCREEN`) lets the window be laid out over the whole display **including the status-bar/navigation-bar/dock strips**. Since occlusion is decided by `otherInfo->frameContainsPoint(x, y)` (§2.2) and `InputWindowInfo::overlaps()` is frame-vs-frame (`libs/input/InputWindow.cpp`: `return frameLeft < other->frameRight && …`), a full-display frame means the overlay occludes **every** point of the display, whereas a frame that stops above the nav/dock strip leaves that strip tappable.
* Sizing the window to the full display bounds adds nothing over "as large as the content" except more occlusion (and more composition work).

> **Q5 answer:** `FLAG_LAYOUT_NO_LIMITS` does not change touchability or dispatch logic, but a full-display **frame** is precisely what makes the untrusted-touch rule apply to 100 % of the screen. Note also that shrinking only the *touchable region* (e.g. `TOUCHABLE_INSETS_*`, `setTouchableRegion`) does **not** reduce occlusion — the dispatcher uses the frame for that; only a smaller **window** does.

---

## 7. Q6 — EMUI/Huawei `LauncherSmartDockFullScreenMaskWindow` and friends

**Verified negative:** `LauncherSmartDockFullScreenMaskWindow`, `LauncherTransparentFullView` and `LauncherSmartDock` have **zero** hits in any public code or web index (Sourcegraph global literal search, Bing exact-phrase, GitHub, Chinese sources; control strings `FLAG_NOT_TOUCHABLE`/`MaskWindow`/`SmartDock` all return thousands of hits on the same endpoints, so the zeros are real). **No public source attributes any behaviour to those names, and none documents an unrelated overlay provoking a launcher mask window** (details in the appendix, §11).

What *is* documented, and what matters, is this instead:

### 7.1 Huawei's own developer documentation confirms the AOSP mechanism — and blames Android 12, not EMUI

Huawei Developer Forum FAQ, *"【FAQ】HarmonyOS 3.0 悬浮窗触摸事件被屏蔽"* ([developer.huawei.com](https://developer.huawei.com/consumer/cn/forum/topic/0202108637941208003), mirror [cnblogs](https://www.cnblogs.com/developer-huawei/p/17045541.html)) — the problem statement is *exactly* this bug:

> **【问题描述】** 在HarmonyOS 3.0上创建悬浮窗口，触摸事件无法传递到窗口下层，此问题在2.0系统上未发现。
> **【解决方案】** 原因是HarmonyOS 3.0基于Android12版本。Android 12上不受信任的触摸事件都会被屏蔽，无法穿透到窗口下层。目前主要的解决方案有两种：一、创建可信的窗口 `TYPE_APPLICATION_OVERLAY`在Android12上是不可信窗口需要使用无障碍窗口（`TYPE_ACCESSIBILITY_OVERLAY`）替代。二、窗口透明度设置为全透明 设置Window的alpha值为0。
>
> *(Problem: on HarmonyOS 3.0 a floating window's touch events cannot be passed to the window below; not observed on 2.0. Solution: because HarmonyOS 3.0 is based on Android 12 — on Android 12 untrusted touch events are all blocked and cannot penetrate to the window below. Two main solutions: (1) create a trusted window — `TYPE_APPLICATION_OVERLAY` is an untrusted window on Android 12, use an accessibility window `TYPE_ACCESSIBILITY_OVERLAY` instead; (2) set the window alpha to fully transparent, i.e. `alpha = 0`.)*

This is an OEM stating that the behaviour on its own Android-12-based ROM is the stock Android 12 rule, and that the only ways out are the trusted-window exception or `alpha == 0` — i.e. the two exemptions proven from AOSP in §2.2/§4.2.

### 7.2 A near-identical field report of the exact flag combination

Stack Overflow [*"Unable to click the below overlay on Android 12"*](https://stackoverflow.com/questions/72583813/unable-to-click-the-below-overlay-on-android-12) uses **the same configuration as this bug** — `TYPE_APPLICATION_OVERLAY`, `FLAG_NOT_TOUCHABLE | FLAG_NOT_FOCUSABLE | FLAG_LAYOUT_NO_LIMITS | FLAG_LAYOUT_IN_SCREEN`, `PixelFormat.TRANSLUCENT`, full-screen — with the symptom "since Android 12 it no longer works … I no longer can click on anything or change anything at all", and the accepted workaround is `if (Build.VERSION.SDK_INT >= 31) { params.alpha = 0.8f; }`. Related: [SO 72110210](https://stackoverflow.com/questions/72110210/android-12-is-blocking-the-touches-when-using-the-uses-permission-androidname), [SO 79887026](https://stackoverflow.com/questions/79887026/untrusted-touch-due-to-occlusion-by-windowname-android) (the latter also documents that a system `Dim Layer` window, uid 1000, can itself be the occluder — a reminder that any *other* untrusted window can block, not just yours).

### 7.3 EMUI's own masks do exist — but as launcher/sidebar UI, not as a reaction to your overlay

Huawei's dock/sidebar and dialog patterns do use a full-screen 蒙层 (mask) with separate, failure-prone dismissal — e.g. Huawei's own Q&A thread *"侧边栏 HdsSideBar，通过侧滑方式关闭侧边栏时，蒙层未被正确关闭，导致异常"* ([forum](https://developer.huawei.com/consumer/cn/forum/topic/0208211564586569135)), and the documented sidebar-overlay design (*"侧边栏显示时，主内容区域通常会添加半透明遮罩"*, [Tencent Cloud writeup](https://cloud.tencent.cn/developer/article/2536227)). But **no source connects any such mask to an unrelated full-screen overlay**, and such a mask is touchable *by design* (it exists to catch the outside tap) — whereas a `NOT_TOUCHABLE` overlay cannot steal a tap from a touchable mask; it can only make the **system** drop the tap.

Also verified: Huawei ships its own overlay-obstruction detector with a user-visible string — *"当前操作有悬浮窗遮挡，请小心操作"* — and its official remedy is for the **user to close the floating window** ([consumer.huawei.com support page](https://consumer.huawei.com/cn/support/content/zh-cn15942326/)). Huawei moreover gates overlays with its own permission model (`ohos.permission.SYSTEM_FLOAT_WINDOW` on HarmonyOS, per-app 悬浮窗 permission on EMUI) — but **no EMUI-specific input-dispatch filter, and no setting such as a "悬浮窗拦截" touch filter, could be found**; Huawei's own FAQ attributes the behaviour to Android 12 (§7.1).

> **Q6 answer:** there is no evidence for `LauncherSmartDockFullScreenMaskWindow`/`LauncherTransparentFullView`/`LauncherSmartDock` existing or being provoked by an overlay; treat that chain as unproven. The documented Huawei-side explanation for this exact symptom is the stock Android 12 untrusted-touch rule. Prove or disprove it on the device with the §10 steps before pursuing the mask theory.

---

## 8. Verdict — which mechanism most plausibly explains the symptom

**Primary (assume it until disproven): Android 12+ untrusted-touch blocking.** Every observation is reproduced by the stock AOSP code with no OEM special-casing:

| Observation | Explanation in stock AOSP |
|---|---|
| Window declares `FLAG_NOT_TOUCHABLE`, yet touches to the app below vanish | `NOT_TOUCHABLE` only removes it from hit-testing; it still obscures (§2.1/§2.2). Blocking is then applied to the *window below* (§4.4). |
| Physical finger taps swallowed | DOWN is dropped before any target is set → app below gets nothing, not even a cancel-able stream (§4.4). |
| `adb shell input tap` swallowed | Injected motion events are enqueued into the same inbound queue and pass through `findTouchedWindowTargetsLocked`; the occlusion check is not bypassed for `POLICY_FLAG_TRUSTED` (§4.4). |
| Key/hardware events still work | The whole mechanism is inside motion-event target selection; `NOT_FOCUSABLE` keeps focus where it was, so key events are unaffected. |
| Nothing in the app's own logs | The drop is logged by `system_server`/inputflinger: `Dropping untrusted touch event due to <pkg>/<uid>` and `Untrusted touch due to occlusion by <pkg>/<uid> (obscuring opacity = 1.00, maximum allowed = 0.80)` (§4.4). |
| `TYPE_APPLICATION_OVERLAY` (and `TYPE_PHONE`) | Both are "system alert window types" → `TouchOcclusionMode::USE_OPACITY` (§4.2). |
| `PixelFormat.TRANSLUCENT` but still blocked | Input alpha is the *window* alpha, default `1.0`, not the pixel format (§4.5). |
| Full-display size (2560×1440) + `LAYOUT_IN_SCREEN`/`NO_LIMITS` | Makes the occluding **frame** cover every point, including the dock/nav strip (§6). |

**Secondary (test only if the primary is excluded):** an OEM/EMUI window (launcher mask, or a Huawei overlay policy that ignores the alpha exemption / uses an out-of-spec `block_untrusted_touches` value such as `3`). Discriminate with §10 steps 1-4. Also possible, but only if `dumpsys input` shows it: the effective flags of the overlay window are not what the app set (touch-modal, §5), or a *second* full-screen window of the same app exists.

**Why the OEM hypothesis is weak here:** (a) Huawei's own developer FAQ describes this exact symptom on HarmonyOS 3.0 and attributes it to the Android 12 rule, recommending the trusted-window or `alpha = 0` exemption (§7.1); (b) the three quoted EMUI window names have zero public evidence of existing (§7); (c) an anti-occlusion mask would have to be *touchable* to consume the tap, and it would then be a plain launcher window visible in `dumpsys window windows` — a fact that is cheap to check (§10 step 4).

**Independent real-world corroboration of exactly this configuration** (community evidence, but it matches the AOSP code path one-for-one): a Stack Overflow report of an overlay that declares `FLAG_NOT_TOUCHABLE` and still kills touches shows the dispatcher's own dump line —
`type=2038, package=…, id=204, mode=USE_OPACITY, alpha=1.00, frame=[0,145][1080,2296], … flags={NOT_FOCUSABLE | NOT_TOUCHABLE | NOT_TOUCH_MODAL | LAYOUT_IN_SCREEN | FORCE_NOT_FULLSCREEN | HARDWARE_ACCELERATED}` — i.e. *non-touchable, SAW type, `USE_OPACITY`, `alpha=1.00`*, and the accompanying logcat `InputDispatcher: Untrusted touch due to occlusion by … (obscuring opacity = 1.00, maximum allowed = 0.80)` ([Stack Overflow](https://stackoverflow.com/questions/68861400/untrusted-touch-events-are-blocked-android-12), [Tencent Cloud writeup](https://cloud.tencent.com/developer/article/2368014)).

**Not plausible:** `FLAG_WATCH_OUTSIDE_TOUCH` (§3) and `FLAG_LAYOUT_NO_LIMITS` as an independent cause (§6).

**Why the EMUI *dock* specifically is affected, without invoking a launcher mask:** `TYPE_APPLICATION_OVERLAY` is displayed "above all activity windows … but below critical system windows like the status bar or IME". A launcher/SmartDock that is an ordinary activity-layer window therefore sits **below** the overlay, while a real system window (`TYPE_NAVIGATION_BAR`, `TYPE_DOCK_DIVIDER`, status bar) sits above it. Under the AOSP mechanism, everything below the overlay — the app *and* the launcher/dock — loses its taps, while genuine system windows keep working. That is fully consistent with "the dock is dead but hardware keys work", with no OEM mask window required.

---

## 9. Ranked fixes

### Diagnostics first (do these before changing code)
0. `adb shell settings get global block_untrusted_touches` → expect `null` (= default `BLOCK`) or `2`. Then `adb shell settings put global block_untrusted_touches 0` (or `adb shell am compat disable BLOCK_UNTRUSTED_TOUCHES <overlay.package>`). **If taps instantly start working, the cause is confirmed and every fix below is validated as relevant.** Revert with `2` / `am compat reset`. Also record `getprop ro.build.version.sdk`: on **< 31** the AOSP route cannot be the cause and the OEM hypothesis takes over (§2.1, §8).

### Code fixes, best first

> For a purely decorative overlay that must stay visible and must never block input, the pragmatic combination is **#1 + #2 together**: shrink the window frame to the drawn content *and* keep the window alpha comfortably below the threshold. If neither is acceptable (the decoration must cover the whole 2560×1440 display at full opacity and a *different* app underneath must stay tappable), then on Android 12+ there is **no third-party-app configuration that achieves it** — that is the security feature working as designed, and the options left are trusted/system signing (#4), an accessibility overlay (#5), or an OEM/ops-level opt-out (#6).
1. **Make the window's frame not cover the interactive area** — size the overlay to the drawn content (`WRAP_CONTENT`, or the exact strip/region), and drop `FLAG_LAYOUT_NO_LIMITS`. Because occlusion is frame-based (`frameContainsPoint`, §2.2/§6), a frame that does not contain the touch point cannot block it, *even at alpha 1.0*. This is the only fix that keeps full opacity, and it is exactly what the official blog recommends: "reduce the window boundaries to the actual UI and use `FLAG_NOT_TOUCH_MODAL` … Now touches outside your UI will go directly to the window behind and won't be blocked."
   - *Risk/limits:* a decoration that must cover the entire screen cannot use it; and it only unblocks the region it stops covering. Note that if the launcher dock is what must stay usable, the overlay frame must exclude the dock strip — excluding it from the *touchable region* is not enough.
2. **Keep the window's alpha below the maximum obscuring opacity (0.8 by default, use ~0.5 for margin)** — keep the window type a system-alert type (`TYPE_APPLICATION_OVERLAY`; *not* `TYPE_PHONE` on API 26+) and set `LayoutParams.alpha` at the **window** level (child-view alpha does not count).
   - *Risk/limits:* alpha is applied to the whole layer tree (dimming the SurfaceView content); the rule is per-UID and *combined*, so several overlapping SAW windows from the same app must satisfy `1-(1-a1)(1-a2)… ≤ 0.8`; a device/OEM could lower `maximum_obscuring_opacity_for_touch` (read it via `InputManager.getMaximumObscuringOpacityForTouch()`); and the 0.8 boundary is documented inconsistently (§4.3), so do not sit exactly on it. If a different window type is used (not a SAW type), the mode becomes `BLOCK_UNTRUSTED` and opacity stops mattering entirely.
3. **Let the app below be the same UID / render inside your own window** — `canBeObscuredBy()` returns false when the touched window and the obscuring window share an owner UID (§2.2). If the UI that must stay tappable is your own app's, put the decoration in your own window (a `SurfaceView`/view inside the activity, `setZOrderOnTop(true)` if it must float above other views) instead of a separate overlay window.
   - *Risk/limits:* useless if the app below is a different app (launcher, other vendor app).
4. **Don't be an overlay at all for full-screen decorative work** — if the requirement is "always visible on the head unit, never interactive", the appropriate mechanism on an OEM image is a system-signed app using `LayoutParams.setTrustedOverlay()` (`PRIVATE_FLAG_TRUSTED_OVERLAY` + `INTERNAL_SYSTEM_WINDOW`, android12-release `WindowManager.java` line 3512, `WindowState` line 1074). Trusted overlays are skipped by `canBeObscuredBy()`.
   - *Risk/limits:* needs platform signing/privileged permission — a normal third-party APK **cannot** use it (`setTrustedOverlay()` is `@hide` and the permission check is enforced in `WindowState`).
5. **Use a trusted window type instead of a system-alert window** — `TYPE_ACCESSIBILITY_OVERLAY` is on the `InputMonitor.isTrustedOverlay()` whitelist (§4.2) and is therefore exempt at *any* alpha. This is Huawei's own second recommendation for this exact symptom (§7.1).
   - *Risk/limits:* requires shipping an `AccessibilityService` and the user enabling it; the service must be able to explain its purpose (Play policy and user trust); it changes the app's architecture and permissions substantially. Reasonable on a managed/fleet head-unit image, questionable for a general app.
6. **Per-app compat opt-out, shipped as documentation/ops step, not as app code** — `adb shell am compat disable BLOCK_UNTRUSTED_TOUCHES <pkg>` (Android **12 only**, see §4.2) or `settings put global block_untrusted_touches 0` (device-wide, Android 12/13; **gone on Android 14+**, §4.3). Good as a field workaround; an app cannot set this for itself (the setting requires `WRITE_SECURE_SETTINGS`; the compat override requires the installer/shell).
7. **Flag hygiene (necessary but not sufficient):** `FLAG_NOT_FOCUSABLE | FLAG_NOT_TOUCHABLE` (plus `FLAG_LAYOUT_IN_SCREEN` if you must ignore insets), `TYPE_APPLICATION_OVERLAY`, `PixelFormat.TRANSLUCENT`, window size = content size. Do **not** set `FLAG_NOT_TOUCH_MODAL`-clearing flags, do not set `FLAG_LAYOUT_NO_LIMITS`, do not add `FLAG_WATCH_OUTSIDE_TOUCH` unless you actually need `ACTION_OUTSIDE`, avoid `FLAG_DIM_BEHIND` (the system `Dim Layer` window is itself an occluder that can trigger the block — see SO 79887026 in §12), and do not use `TYPE_PHONE` on API 26+.

### OEM pitfalls to keep in mind
* Huawei/EMUI may replace or extend the AOSP rules; a `block_untrusted_touches` value of `3` is not AOSP (§4.3) and should be treated as an OEM extension to be confirmed on the device.
* Conversely, an app *underneath* your overlay can call `Window.setHideOverlayWindows(true)` (API 31, requires the `HIDE_OVERLAY_WINDOWS` permission) — "Prevent non-system overlay windows from being drawn on top of this window" — or set `SYSTEM_FLAG_HIDE_NON_SYSTEM_OVERLAY_WINDOWS`, which makes the system hide non-system overlays entirely, so your decoration can disappear on sensitive screens ([docs](https://developer.android.com/reference/android/view/Window#setHideOverlayWindows(boolean)), [Android 12 features](https://developer.android.com/about/versions/12/features#hide-application-overlay-windows)). Google's own advice on that page: "Apps that show windows of type `TYPE_APPLICATION_OVERLAY` should consider alternatives that may be more appropriate for their use case, such as picture-in-picture or bubbles."
* No official "how to build a non-interactive/decorative overlay" guide exists (the plausible URLs `developer.android.com/guide/topics/ui/overlays`, `.../develop/ui/views/overlays`, `source.android.com/docs/core/display/hide-overlays` all 404). The authoritative material is the `FLAG_NOT_TOUCHABLE` reference, the Android 12 behaviour-change page, the [tapjacking risk page](https://developer.android.com/privacy-and-security/risks/tapjacking) and the [Android Developers blog post](https://medium.com/androiddevelopers/untrusted-touch-events-2c0e0b9c374c).
* **Unproven possibility:** an OEM launcher could raise its own full-screen mask window (an anti-occlusion/"tap outside to collapse" catcher). No public evidence exists for the specific EMUI names or for such a window being provoked by an unrelated overlay (§11.1, §11.4-N1). If `dumpsys window windows` shows one appearing when your overlay is added, the launcher is the actual touch consumer and the overlay is only the trigger — that must be fixed on the OEM side (or by not being full-screen).
* Older automotive images (API 29/30, Android 10/11) have **no** untrusted-touch logic at all (verified: `android11-release` `InputDispatcher.cpp` only skips `NOT_TOUCHABLE` windows), so on those builds the same symptom points at an OEM window/policy instead — run the §10 checks to tell them apart.

---

## 10. Diagnostic cookbook (exact commands)

```bash
# 0. Which Android is this actually? (<31 => the AOSP untrusted-touch route is OFF, see §2.1/§4)
adb shell getprop ro.build.version.sdk
adb shell getprop ro.build.version.release

# 1. Is the AOSP feature on, and in which mode?
adb shell settings get global block_untrusted_touches          # null/2 = blocking, 1 = log only, 0 = off
adb shell settings get global maximum_obscuring_opacity_for_touch   # null => 0.8

# 2. The smoking gun in logcat (inputflinger logs these from system_server):
adb logcat -s InputDispatcher
#   (or) adb logcat -b all | grep -iE "untrusted touch|Untrusted touch due to occlusion"
#   "Dropping untrusted touch event due to <pkg>/<uid>"
#   "Untrusted touch due to occlusion by <pkg>/<uid> (obscuring opacity = 1.00, maximum allowed = 0.80)"

# 3. The overlay's effective input window (alpha / flags / frame / occlusion mode / trusted flag)
adb shell dumpsys input | grep -A12 -i "<your window name>"
#   dump format includes: alpha=, flags={...}, frame=[l,t][r,b], touchableRegion=,
#   trustedOverlay=, touchOcclusionMode=   (a12 InputDispatcher.cpp ~line 5039 and ~5043)

# 4. Any extra full-screen window that appeared (EMUI mask, launcher overlay…)
adb shell dumpsys window windows | grep -iE "Window\{|mOwnerUid|mFrame=|flags=|isReadyForDisplay"
#   look for names such as *MaskWindow*, LauncherSmartDock*, LauncherTransparentFullView,
#   and compare the window list with and without your overlay running
adb shell dumpsys window displays | grep -i "mCurrentFocus\|mFocusedApp"

# 5. Prove the mechanism: toggle the feature and re-tap
adb shell settings put global block_untrusted_touches 0        # taps should start working
adb shell settings put global block_untrusted_touches 2        # back to default
adb shell am compat disable BLOCK_UNTRUSTED_TOUCHES <overlay.package>   # A12 only (§4.2)
adb shell am compat reset   BLOCK_UNTRUSTED_TOUCHES <overlay.package>
```

Two more discriminators between "AOSP untrusted touch" and "OEM mask window":
* **Z-order test.** `computeTouchOcclusionInfoLocked()` only walks windows *above* the touched window (it `break`s when it reaches it). So with the AOSP mechanism, windows that sit **above** the overlay must still receive taps, while everything **below** is dead. Per the reference docs, `TYPE_APPLICATION_OVERLAY` windows are "displayed above all activity windows … but below critical system windows like the status bar or IME" ([docs](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#TYPE_APPLICATION_OVERLAY)), so the status bar / IME / system dock should stay tappable. If even windows above the overlay are dead, something else (a mask window on top, or a touch-modal window) is eating the input.
* **Window-list diff.** Dump `adb shell dumpsys window windows` and `adb shell dumpsys input` with the overlay up and with it removed; the AOSP mechanism adds no new window, whereas an EMUI launcher mask shows up as a new full-screen window (check `mOwnerUid`, `mFrame`, `flags`, and in `dumpsys input` its `touchableRegion`/`flags`).

---

## 11. Appendix — EMUI/Huawei research log (evidence, negatives, inferences)

**Method:** ~22 EN+ZH queries; Sourcegraph global literal search (validated with control strings); Stack Exchange API (Stack Overflow); Huawei developer/consumer docs and forums; primary AOSP sources on `android10/11/12-release`.

### 11.1 The three window names — verified negative
`LauncherSmartDockFullScreenMaskWindow`, `LauncherTransparentFullView`, `LauncherSmartDock` return **zero** hits: Sourcegraph literal search `matchCount 0` for all three and for the substrings `SmartDockFullScreenMask`, `TransparentFullView`, `FullScreenMaskWindow`, while control strings on the same endpoint return thousands (`TYPE_APPLICATION_OVERLAY` 3865, `FLAG_NOT_TOUCHABLE` 3747, `MaskWindow` 3190, `SmartDock` 5194 — the latter all third-party desktop-mode launchers such as [axel358/smartdock](https://github.com/axel358/smartdock), [KSMaan45/smartdock](https://github.com/KSMaan45/smartdock), [OctoberNicole/SmartDockLauncher](https://github.com/OctoberNicole/SmartDockLauncher)). Bing exact-phrase queries return only unrelated fuzzy matches. **No source attributes any behaviour to these names.**

### 11.2 Huawei's mask/遮罩 patterns that *do* exist (but are unrelated to an overlay trigger)
* Huawei's multi-window doc uses "侧边Dock": *"侧滑调出侧边Dock栏，点击Dock上的应用…"* — [智慧多窗简介](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/multi-window-intro); HarmonyOS `SideBarContainer` Overlay mode: *"Overlay | 侧边栏浮在内容区上面"* — [ts-container-sidebarcontainer](https://developer.huawei.com/consumer/cn/doc/harmonyos-references-V13/ts-container-sidebarcontainer-V13).
* The mask pattern is explicit in third-party writeups: *"通常配合半透明遮罩：侧边栏显示时，主内容区域通常会添加半透明遮罩"* — [Tencent Cloud](https://cloud.tencent.cn/developer/article/2536227).
* Huawei's own Q&A thread title shows a *known* mask-lifecycle bug: *"侧边栏HdsSideBar，通过侧滑方式关闭侧边栏时，蒙层未被正确关闭，导致异常"* — [Huawei forum](https://developer.huawei.com/consumer/cn/forum/topic/0208211564586569135).
* ⇒ Such masks exist and are **touchable by design** (they catch the outside tap). A `NOT_TOUCHABLE` overlay cannot steal a tap from one; only the system can *drop* the tap (§4.4).

### 11.3 Huawei's own overlay policies
* Huawei ships an overlay-obstruction detector with a user-visible string: *"当前操作有悬浮窗遮挡，请小心操作"*, and its remedy is for the **user** to close the floating window (悬浮导航 / 速记) — [consumer.huawei.com support](https://consumer.huawei.com/cn/support/content/zh-cn15942326/).
* HarmonyOS gates overlay creation with its own restricted permission `ohos.permission.SYSTEM_FLOAT_WINDOW` (*"悬浮窗是不是不给个人开发者授权"* — [Huawei forum](https://developer.huawei.com.cn/consumer/cn/forum/topic/0201219135241066096), [guide](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/global-floating-window-guide)); ArkUI has its own touchability switch with non-obvious semantics ([Huawei forum](https://developer.huawei.com/consumer/cn/forum/topic/0202212153554883167)).
* Other interfering Huawei floating windows are documented (悬浮导航, 速记, AppAssistant dropzone — [FAQ](https://consumer.huawei.com/ph/support/content/en-us00717984/)).

### 11.4 Explicit negatives (do not assert these)
* **N1** No source (code, doc or forum) states that an unrelated `TYPE_APPLICATION_OVERLAY`/`TYPE_PHONE`/`SYSTEM_ALERT_WINDOW` overlay causes a Huawei **launcher** mask window to be raised, or prevents one from being dismissed.
* **N2** No EMUI/HarmonyOS-specific input-dispatch touch filter and no setting such as a "悬浮窗拦截" touch filter could be found; Huawei's own FAQ attributes the behaviour to Android 12 (§7.1).
* **N3** No documentation of Huawei car head unit (鸿蒙座舱/EMUI automotive) overlay-vs-dock interaction. Closest items: a 超级桌面 sizing complaint ([bbs.itying.com](https://bbs.itying.com/topic/6a1fe445a1029b0042bebab8)) and a 车机超级桌面 status/nav-bar thread ([Huawei forum](https://developer.huawei.com/consumer/cn/forum/topic/0203212064409867847)) — neither mentions SmartDock or touch blocking.
* **N4** Huawei's `HdsSideBar` documentation renders as a shell only; contents unverified.

### 11.5 Labelled inference (not verified on this device)
* **I1** The symptom is the AOSP Android-12 mechanism, not an EMUI mask: full-screen + `FLAG_NOT_TOUCHABLE` + different UID + `LayoutParams.alpha` still at the default 1.0 + SAW type ⇒ `USE_OPACITY` ⇒ composed obscuring opacity 1.00 > 0.80 ⇒ every touched window below is dropped, injected events included, keys unaffected. (Requires API 31+.)
* **I2** Discriminator: an `InputDispatcher` occlusion log means the system dropped the tap and **no** window received it; an extra visible *touchable* full-screen launcher window in `dumpsys window windows` with no occlusion log means the tap was **consumed** (the undocumented mask scenario).
* **I3** If such a mask exists it is a tap-outside-to-collapse catcher belonging to the launcher; no evidence connects its dismissal to the presence of an overlay.
* **I4** EMUI may add its own AppOps/overlay checks, but no code/doc/setting describing an EMUI input filter was found — do not assert it.

---

## 12. Source index

AOSP (all fetched 2026-09-13):
* Android 11 `InputDispatcher.cpp` — https://android.googlesource.com/platform/frameworks/native/+/refs/heads/android11-release/services/inputflinger/dispatcher/InputDispatcher.cpp
* Android 12 `InputDispatcher.cpp` — https://android.googlesource.com/platform/frameworks/native/+/refs/heads/android12-release/services/inputflinger/dispatcher/InputDispatcher.cpp
* Android 12 `InputWindow.h` (input window + flag enum) — https://android.googlesource.com/platform/frameworks/native/+/refs/heads/android12-release/include/input/InputWindow.h
* Android 12 `libs/input/InputWindow.cpp` (`frameContainsPoint`, `overlaps`) — https://android.googlesource.com/platform/frameworks/native/+/refs/heads/android12-release/libs/input/InputWindow.cpp
* Android 12 `TouchOcclusionMode.aidl` / `BlockUntrustedTouchesMode.aidl` — https://android.googlesource.com/platform/frameworks/native/+/refs/heads/android12-release/libs/input/android/os/TouchOcclusionMode.aidl , https://android.googlesource.com/platform/frameworks/native/+/refs/heads/android12-release/libs/input/android/os/BlockUntrustedTouchesMode.aidl
* Current AOSP `InputDispatcher.cpp` / `InputConfig.aidl` — https://android.googlesource.com/platform/frameworks/native/+/refs/heads/main/services/inputflinger/dispatcher/InputDispatcher.cpp , https://android.googlesource.com/platform/frameworks/native/+/refs/heads/main/libs/input/android/os/InputConfig.aidl
* Android 12 `WindowState.java` / `InputMonitor.java` / `WindowManagerService.java` / `InputManagerService.java` — https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/services/core/java/com/android/server/wm/WindowState.java , …/wm/InputMonitor.java , …/wm/WindowManagerService.java , …/server/input/InputManagerService.java
* Android 12 `WindowManager.java` (flag + untrusted-touch javadoc, `isSystemAlertWindowType`, `setTrustedOverlay`) — https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/view/WindowManager.java
* Android 12 `InputManager.java` / `Settings.java` — https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/hardware/input/InputManager.java , …/core/java/android/provider/Settings.java
* Android 12 SurfaceFlinger `Layer.cpp` (`fillInputInfo`, `getAlpha`) — https://android.googlesource.com/platform/frameworks/native/+/refs/heads/android12-release/services/surfaceflinger/Layer.cpp

Documentation:
* Android 12 behaviour changes, all apps → *Untrusted touch events are blocked* — https://developer.android.com/about/versions/12/behavior-changes-all?hl=en
* (Negative result: https://developer.android.com/about/versions/12/behavior-changes-12 contains **nothing** about untrusted touches / obscuring — this is an "all apps" change, not a targetSdk-31-gated one.)
* AOSP platform docs, *Block untrusted touches* — https://source.android.com/docs/core/display#block-untrusted
* Official Android Developers blog, *Untrusted Touch Events in Android* (Meghan Mehta, 2021-05-26) — https://medium.com/androiddevelopers/untrusted-touch-events-2c0e0b9c374c
* AOSP commit that introduced the feature (Bug 158002302) — https://android.googlesource.com/platform/frameworks/base/+/64bbd4b1d93a0150b30ebcf84fa21f6d9304ff1c
* `WindowManager.LayoutParams#FLAG_NOT_TOUCHABLE` (full rules incl. the 0.8 maximum) — https://developer.android.com/reference/android/view/WindowManager.LayoutParams#FLAG_NOT_TOUCHABLE
* `#FLAG_NOT_FOCUSABLE`, `#FLAG_NOT_TOUCH_MODAL`, `#FLAG_WATCH_OUTSIDE_TOUCH`, `#FLAG_LAYOUT_NO_LIMITS`, `#FLAG_LAYOUT_IN_SCREEN`, `#TYPE_APPLICATION_OVERLAY` — https://developer.android.com/reference/android/view/WindowManager.LayoutParams
* `InputManager#getMaximumObscuringOpacityForTouch()` (public API, returns 0.0-1.0) — https://developer.android.com/reference/android/hardware/input/InputManager#getMaximumObscuringOpacityForTouch()
* Tapjacking risk page (the `>= 0.8` wording; `setHideOverlayWindows`) — https://developer.android.com/privacy-and-security/risks/tapjacking
* Android 12 features, *Hide application overlay windows* — https://developer.android.com/about/versions/12/features#hide-application-overlay-windows
* `Window#setHideOverlayWindows(boolean)` / `HIDE_OVERLAY_WINDOWS` — https://developer.android.com/reference/android/view/Window#setHideOverlayWindows(boolean)
* `MotionEvent#FLAG_WINDOW_IS_OBSCURED` / `#FLAG_WINDOW_IS_PARTIALLY_OBSCURED` — https://developer.android.com/reference/android/view/MotionEvent#FLAG_WINDOW_IS_OBSCURED
* `View#setFilterTouchesWhenObscured` / `#onFilterTouchEventForSecurity` — https://developer.android.com/reference/android/view/View#setFilterTouchesWhenObscured(boolean)
* `Manifest.permission#SYSTEM_ALERT_WINDOW` — https://developer.android.com/reference/android/Manifest.permission#SYSTEM_ALERT_WINDOW
* Community corroboration of the exact failure mode — https://stackoverflow.com/questions/68861400/untrusted-touch-events-are-blocked-android-12 , https://stackoverflow.com/questions/72583813/unable-to-click-the-below-overlay-on-android-12 (same flag set as this bug; fix `params.alpha = 0.8f`), https://stackoverflow.com/questions/72110210/android-12-is-blocking-the-touches-when-using-the-uses-permission-androidname , https://stackoverflow.com/questions/79887026/untrusted-touch-due-to-occlusion-by-windowname-android (system `Dim Layer` as occluder; `removeView`/`alpha`/`TYPE_ACCESSIBILITY_OVERLAY` remedies), https://cloud.tencent.com/developer/article/2368014
* Huawei's own explanation of this exact symptom (HarmonyOS 3.0 悬浮窗触摸事件被屏蔽; solutions: `TYPE_ACCESSIBILITY_OVERLAY` or window `alpha = 0`) — https://developer.huawei.com/consumer/cn/forum/topic/0202108637941208003 (mirror https://www.cnblogs.com/developer-huawei/p/17045541.html)
* Huawei overlay-obstruction prompt *"当前操作有悬浮窗遮挡"* — https://consumer.huawei.com/cn/support/content/zh-cn15942326/
* Verified-negative search index for the EMUI window names — https://sourcegraph.com/search?q=LauncherSmartDockFullScreenMaskWindow&patternType=literal
* OWASP MASTG, *Preventing Overlay Attacks* (MASTG-BEST-0040) — https://mas.owasp.org/MASTG/best-practices/MASTG-BEST-0040/ ; HackTricks, *Tapjacking* — https://hacktricks.wiki/en/mobile-pentesting/android-app-pentesting/tapjacking.html
* Negative result: there is **no** official developer guide for building a non-interactive/decorative overlay (`developer.android.com/guide/topics/ui/overlays`, `.../develop/ui/views/overlays`, `source.android.com/docs/core/display/hide-overlays` all return 404).
