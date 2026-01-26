## Documentation

Automate UI actions, extract data, and perform assertions using AI. It offers JavaScript SDK, Chrome extension, and support for scripting in YAML.

See https://midscenejs.com/ for details.

## High-Performance Screenshots with Scrcpy (Optional)

This package supports scrcpy for high-performance Android screenshots, providing 6-8x faster screenshot capture compared to standard ADB methods.

### Automatic Setup

The scrcpy server binary is **automatically downloaded** during package build via a prebuild script.

- **Version**: v3.0
- **Source**: https://github.com/Genymobile/scrcpy/releases
- **License**: Apache License 2.0
- **When**: Downloaded during `pnpm build` (before compilation)
- **Included**: Pre-downloaded binary is included in published npm package

**For users installing from npm**: No download needed - the binary is already included in the package.

**For developers**: The binary is downloaded automatically when running `pnpm build`.

### Manual Installation (For Development)

If you're developing and the automatic download fails, you can manually download the server binary:

```bash
# Download the scrcpy server
wget https://github.com/Genymobile/scrcpy/releases/download/v3.0/scrcpy-server-v3.0

# Place it in the correct location
mkdir -p packages/android/bin
mv scrcpy-server-v3.0 packages/android/bin/scrcpy-server
```

Then run the build:
```bash
pnpm build
```

### Usage

Scrcpy screenshots are **enabled by default** and will automatically fall back to standard ADB if unavailable:

```typescript
import { AndroidDevice } from '@midscene/android';

// Scrcpy is enabled by default
const device = new AndroidDevice(deviceId);
```

To customize scrcpy settings:

```typescript
const device = new AndroidDevice(deviceId, {
  scrcpyConfig: {
    enabled: true,        // Default: true
    maxSize: 1024,        // Optional: max video dimension
    idleTimeoutMs: 30000, // Optional: idle disconnect timeout
    videoBitRate: 2000000,// Optional: video bitrate (bps)
  },
});
```

To disable scrcpy and force ADB mode:

```typescript
const device = new AndroidDevice(deviceId, {
  scrcpyConfig: { enabled: false },
});
```

### Performance Comparison

| Scenario | Standard ADB | Scrcpy | Improvement |
|----------|--------------|--------|-------------|
| First screenshot | ~715ms | ~1500ms | -52% |
| Subsequent screenshots | ~715ms | ~100ms | +615% |
| 10 consecutive screenshots | ~7150ms | ~2500ms | +186% |

### Troubleshooting

If scrcpy fails, the package automatically falls back to standard ADB mode without affecting functionality.

Common issues:
- **First run slow**: Initial scrcpy connection setup takes 1-2 seconds
- **ffmpeg errors**: Ensure `@ffmpeg-installer/ffmpeg` is installed (already in optionalDependencies)
- **Server download failed**: Check network connectivity or manually place scrcpy-server

## License

Midscene is MIT licensed.