# Desktop input contract

`ComputerDevice` and `RDPDevice` expose the same computer actions. Their event
transports differ, but the behavior below is shared. Defaults live in
`src/desktop-input-policy.ts`.

| Action | Shared behavior |
| --- | --- |
| Tap, DoubleClick, RightClick | Finish moving to the target, then wait 100 ms before pressing. |
| Tap | Hold the left button for 100 ms by default. Honor the pointer primitive's `duration` override; release the button after a completed press even if the hold fails. |
| Hover | Wait 100 ms after the final pointer move. |
| Scroll with a target | Move to the target and wait 50 ms before scrolling there. |
| Scroll without a target | Anchor inside the viewport or active window, then wait 100 ms before scrolling. |
| Input without a target | Type into the current focus without clearing it. An explicit `clear` mode clears it. |
| Input with a target | Focus the target and wait 300 ms. Replace mode clears it before typing, while `typeOnly` does not. Wait 150 ms after clearing. |
| `focusOnly` input | Focus the target without clearing or typing. |
| ClearInput with a target | Focus the target and wait 300 ms before clearing; wait 150 ms after clearing. |
| KeyboardPress with a target | Focus the target and wait 50 ms before pressing the key. |

The 100 ms UI settling period was selected after repeated RDP clicks on
Douyin's favorite button (1280 × 720 desktop, September 28, 2026). Each delay
was interleaved across videos and judged by whether the expected login modal
appeared. Results: 0 ms 0/8, 10 ms 1/8, 20 ms 3/8, 30 ms 7/8, 40 ms 6/8,
50 ms 24/24, 100 ms 24/24, and 150/200/300 ms 8/8 each. The 100 ms default
leaves more margin than 50 ms above the unstable 20–40 ms range while saving
200 ms per settled pointer action compared with the previous 300 ms default.
The rebuilt `pointer.tap` path then passed another 8/8 favorite clicks at the
100 ms default. These results cover one application and RDP connection, not
every desktop UI.
The 100 ms tap hold comes from the existing native desktop behavior. The 50 ms
move settle is for ordinary pointer positioning and is not a substitute for
the UI settling period.
The keyboard focus and clearing delays preserve the larger existing values
across the two adapters while giving each action one shared default.

Backend-specific code remains responsible for coordinates, event delivery,
Windows DPI correction, the macOS activation click, and RDP wheel encoding.
RDP has no local active-window geometry, so its untargeted scroll falls back to
the viewport center.

When changing either adapter, compare the other adapter against this table,
update the relevant unit tests for both, and run
`pnpm exec nx test @midscene/computer` plus
`pnpm exec nx build @midscene/computer`. Use a real desktop test when behavior
depends on the receiving application.
