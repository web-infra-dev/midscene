# Homepage annotation design QA

## Comparison target

- Source visual truth:
  - `/var/folders/7y/g7vkqwjn1ws8bv9yt8glqwmw0000gn/T/codex-clipboard-51b56191-9158-434a-a6ab-d61bd42f9778.png` (2572 × 1438 px)
  - `/var/folders/7y/g7vkqwjn1ws8bv9yt8glqwmw0000gn/T/codex-clipboard-c3876a90-3c82-4ea9-b1a7-d2234f98b9c7.png` (3192 × 1774 px)
- Final implementation captures:
  - `/private/tmp/midscene-home-annotation-final-dark.png` (1905 × 1059 px)
  - `/private/tmp/midscene-home-annotation-final-divider.png` (1905 × 1059 px)
- Full-view comparison: `/private/tmp/midscene-home-qa-comparison-full.png`
- Background comparison: `/private/tmp/midscene-home-qa-comparison-background.png`
- Focused comparison: `/private/tmp/midscene-home-qa-comparison-focus.png`
- Browser CSS viewport: 1920 × 1080, device pixel ratio 1.
- State: English homepage, dark mode, animated hero video playing.
- Density normalization: the source screenshots have unknown capture density, so source and implementation panels were proportionally resized to the same 950 px comparison width. Judgement used relative spacing, color continuity, border emphasis, and divider treatment rather than raw pixel alignment.

## Findings

No actionable P0, P1, or P2 mismatch remains for the requested annotations.

- Fonts and typography: existing homepage families, sizes, weights, line heights, wrapping, and copy are preserved. Only the requested Stars value changed to `14k+`.
- Spacing and layout rhythm: the title-to-preview visible gap increased from approximately 7.7 px to 31.7 px. Other hero coordinates and downstream section content remain unchanged; feature divider flow height remains 1 px.
- Colors and visual tokens: the dark preview border changed from solid white to 24% white. Hero and all following homepage regions now use `#0a0a0a` in dark mode and white in light mode.
- Image quality and asset fidelity: the existing local Figma assets, posters, crop, and autoplay videos are unchanged. Different video frames between captures are expected animation state, not design drift.
- Copy and content: all copy remains unchanged except the explicitly requested Stars value.
- Interactions: theme switching works, both hero CTA links retain their original destinations, and the visible hero video is playing (`readyState: 4`). Browser console contains no errors.

## Comparison history

1. Initial review — blocked:
   - P1: dark preview frame used a solid white border and was overly prominent.
   - P2: the first title line ended roughly 7.7 px before the preview frame.
   - P1: hero background was `#0a0a0a`, while subsequent sections used `#121212`.
   - P2: downstream dividers were plain 1360 px lines and did not match the hero divider.
   - P2: development Stars value displayed `--`.
2. First fix pass:
   - Reduced the dark frame border to 24% white.
   - Shifted the preview and fade treatment 24 px right, producing approximately 31.7 px visible title clearance.
   - Unified subsequent section backgrounds with the hero.
   - Reused one divider component for the hero and the three existing downstream dividers.
   - Set Stars to `14k+` and removed the no-longer-needed build-time GitHub fetch.
3. Final pass — post-fix evidence:
   - Full and focused comparison images show the annotated frame and spacing issues resolved.
   - Computed dark backgrounds both resolve to `rgb(10, 10, 10)`.
   - Existing downstream content layout, cards, text, and interactions remain intact.

## Follow-up polish

No P3 follow-up is required for this annotation scope.

final result: passed
