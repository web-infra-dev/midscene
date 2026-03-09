# Vitest Midscene Addon

AI-driven E2E testing skill for Web, Android, and iOS.

## Structure

```
├── SKILL.md                        # Skill entry point (detect state → route to phase)
├── metadata.json
├── install.sh                      # Multi-tool installer
├── references/                     # Skill reference docs
│   ├── detect.md                   # Project state detection
│   ├── phases/                     # Three-phase execution (create/transform/enhance)
│   ├── specs/                      # Standard project specification
│   ├── apis/                       # API references
│   └── patterns/                   # Platform code patterns
└── boilerplate/                    # Reference implementation (copy to scaffold)
    ├── e2e/                        # Example tests
    ├── src/context/                # Platform context classes
    ├── vitest.config.ts
    └── package.json
```

## Key Concepts

- **Three-phase model**: Detect project state (Empty/Existing/Ready) → route to Create/Transform/Enhance phase
- **Boilerplate** (`boilerplate/`) is the canonical reference implementation
- **Patterns** (`references/patterns/`) define per-platform test code patterns
- All platforms use the fixture pattern: `XxxTest.init()` → `fixture.create()` → `ctx.agent`

## Install

```bash
bash install.sh              # All tools
bash install.sh claude       # Claude Code only
bash install.sh trae         # Trae only
bash install.sh codex        # Codex only
```
