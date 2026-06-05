/**
 * Canonical per-platform connection / launch target options.
 *
 * These are the first-class "how to reach the target" types. They describe the
 * connection only — agent behavior (`AgentOpt`) and YAML run config
 * (`MidsceneYamlScriptConfig`) are expressed separately. The
 * `MidsceneYamlScript*Env` types in `./yaml` are composed FROM these (env =
 * connection + run config + agent behavior), so the connection options are the
 * source of truth, not a byproduct of the YAML schema.
 */
import type {
  AndroidDeviceOpt,
  HarmonyDeviceOpt,
  IOSDeviceOpt,
} from './device';

/** How to reach / launch a web target. */
export interface WebConnectionOpt {
  // for web only
  serve?: string;
  url: string;

  // puppeteer only
  userAgent?: string;
  acceptInsecureCerts?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  deviceScaleFactor?: number;
  waitForNetworkIdle?: {
    timeout?: number;
    continueOnNetworkIdleError?: boolean; // should continue if failed to wait for network idle, true for default
  };
  cookie?: string;
  forceSameTabNavigation?: boolean; // if track the newly opened tab, true for default in yaml script

  /**
   * Custom Chrome launch arguments (Puppeteer only, not supported in bridge mode).
   *
   * Allows passing custom command-line arguments to Chrome/Chromium when launching the browser.
   * This is useful for testing scenarios that require specific browser configurations.
   *
   * ⚠️ Security Warning: Some arguments (e.g., --no-sandbox, --disable-web-security) may
   * reduce browser security. Use only in controlled testing environments.
   *
   * @example
   * ```yaml
   * web:
   *   url: https://example.com
   *   chromeArgs:
   *     - '--disable-features=ThirdPartyCookiePhaseout'
   *     - '--disable-features=SameSiteByDefaultCookies'
   *     - '--window-size=1920,1080'
   * ```
   */
  chromeArgs?: string[];

  // bridge mode config
  bridgeMode?: false | 'newTabWithUrl' | 'currentTab';
  closeNewTabsAfterDisconnect?: boolean;

  /**
   * CDP (Chrome DevTools Protocol) endpoint URL.
   * When specified, connects to an existing Chrome browser via CDP instead of launching a new one.
   *
   * @example
   * ```yaml
   * web:
   *   url: https://example.com
   *   cdpEndpoint: ws://localhost:9222/devtools/browser/xxxx
   * ```
   */
  cdpEndpoint?: string;
}

/** How to reach / launch an Android target (device driver options + which device + what to launch). */
export interface AndroidConnectionOpt
  extends Omit<AndroidDeviceOpt, 'customActions'> {
  // The Android device ID to connect to, optional, will use the first device if not specified
  deviceId?: string;

  // The URL or app package to launch, optional, will use the current screen if not specified
  launch?: string;
}

/** How to reach / launch an iOS target. */
export interface IOSConnectionOpt extends Omit<IOSDeviceOpt, 'customActions'> {
  // The URL or app bundle ID to launch, optional, will use the current screen if not specified
  launch?: string;
}

/** How to reach / launch a HarmonyOS target. */
export interface HarmonyConnectionOpt
  extends Omit<HarmonyDeviceOpt, 'customActions'> {
  // The HarmonyOS device ID to connect to, optional, will use the first device if not specified
  deviceId?: string;

  // The app package to launch, optional, will use the current screen if not specified
  launch?: string;

  // Custom mapping of app names to bundle names, user-provided mappings take precedence over defaults
  appNameMapping?: Record<string, string>;
}

/** How to reach a computer target. */
export interface ComputerConnectionOpt {
  // The display ID to use, optional, will use the primary display if not specified
  displayId?: string;
}
