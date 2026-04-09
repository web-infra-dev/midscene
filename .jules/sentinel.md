## 2026-04-09 - Shell and AppleScript Injection in `packages/computer`
**Vulnerability:** Shell command injection via `execSync` combined with unsanitized user input in an AppleScript generated for keystrokes in `packages/computer/src/device.ts` (`sendKeyViaAppleScript`).
**Learning:** Interpolating user-provided inputs directly into a shell command (`osascript -e '...'`) can lead to arbitrary command execution on the host machine. The lack of escaping inside the AppleScript string further allows AppleScript injection.
**Prevention:** Avoid shell evaluation completely by using `execFileSync` (or `spawnSync`) and passing arguments as an array instead of a single string. When dynamically generating AppleScript containing user input, always escape backslashes and quotes (`"`) explicitly.
