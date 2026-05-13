# Backlogs

- Web deepLocate pinch-zoom experiment: define follow-up coordinate semantics for report, dump, and cache. Current implementation intentionally keeps the rough web-only flow of `locate -> pinch zoom -> re-locate -> act -> pinch restore -> capture final screenshot`, so zoom-space vs original-page-space rect mapping is still unresolved. Next step: decide which fields should stay in zoom coordinates and which must be restored to original page coordinates before this flow is promoted beyond experiment status.
