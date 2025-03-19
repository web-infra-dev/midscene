# Midscene Chrome DevTools

Chrome extension version of the Midscene tool, providing browser automation, Bridge mode, and a Playground testing environment.

## Development Guide

### Environment Setup

Make sure you have completed the basic environment setup according to the main project's [Contribution Guide](../../CONTRIBUTING.md).

### Directory Structure

```
chrome-devtools/
├── dist/                 # Build output directory, can be directly installed as a Chrome extension
├── extension/            # Packaged Chrome extension
│   └── midscene-extension-v{version}.zip    # Compressed extension
├── scripts/              # Build and utility scripts
│   ├── build-report-template.js   # Generate report template
│   └── pack-extension.js          # Package Chrome extension
├── src/                  # Source code
│   ├── extension/        # Chrome extension-related components
│   │   ├── bridge.tsx    # Bridge mode UI
│   │   ├── popup.tsx     # Extension popup homepage
│   │   ├── misc.tsx      # Auxiliary components
│   │   ├── utils.ts      # Utility functions
│   │   ├── common.less   # Common style variables
│   │   ├── popup.less    # Popup styles
│   │   └── bridge.less   # Bridge mode styles
│   ├── blank_polyfill.ts # Browser polyfill for Node.js modules
│   ├── index.tsx         # Main entry
│   └── App.tsx           # Main application component
├── static/               # Static resources directory, will be copied to the dist directory
│   └── scripts/          # Script resources
│       └── report-template.js     # Generated report template
├── package.json          # Project configuration
├── rsbuild.config.ts     # Rsbuild build configuration
└── ...
```

### Development Process

1. **Install Dependencies**
```bash
pnpm install
```

2. **Build Dependency Packages**
```bash
# Build all packages in the project root
pnpm run build
```

3. **Development Mode**
```bash
# Start the project in development mode
cd apps/chrome-devtools
pnpm run dev
```

4. **Build Project**
```bash
# Build the Chrome extension
cd apps/chrome-devtools
pnpm run build
```

The build process includes:
- Building the web application using rsbuild
- Generating the report template script (report-template.js)
- Packaging the build artifacts as a Chrome extension

### Installing the Extension

#### Method 1: Using the dist directory (for development and debugging)

The built `dist` directory can be directly installed as a Chrome extension:
1. Open Chrome browser, navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" in the top-left corner
4. Select the `apps/chrome-devtools/dist` directory

This method is suitable for quick testing during development.

#### Method 2: Using the packaged extension file

For publishing or sharing:
1. Use the `pnpm run build` command to build the project
2. Find the `midscene-extension-v{version}.zip` file in the `extension` directory
3. Upload this file to the Chrome Web Store developer console, or share it with others for installation

### Debugging Tips

#### Debugging the Extension Background

1. Find the Midscene extension on the Chrome extensions page (`chrome://extensions/`)
2. Click the "view: background page" link to open the developer tools
3. Use the console and network panels for debugging

#### Debugging the Popup Window

1. Click the Midscene icon in the Chrome toolbar to open the extension popup
2. Right-click on the popup and select "Inspect"
3. Use the developer tools to debug UI and interactions

#### Debugging Content Scripts

1. Open any webpage, click the Midscene icon to activate the extension
2. Open the developer tools
3. Find the Midscene scripts in the "Content scripts" section under the "Sources" panel

### Feature Description

#### Report Template

The Chrome extension uses the HTML report template from the `@midscene/visualizer` package. During the build process, it:
- Reads `packages/visualizer/dist/report/index.html`
- Converts its content to a JavaScript string
- Creates a JS file containing the `get_midscene_report_tpl()` function
- Saves it to `static/scripts/report-template.js`

#### Bridge Mode

Bridge mode allows controlling the browser from a local terminal via the Midscene SDK. This is useful for operating the browser through both scripts and manual interaction, or for reusing cookies.

## Release Process

1. Update the version number in `package.json` to match the main project
2. Run the build: `pnpm run build`
3. Verify the `midscene-extension-v{version}.zip` file generated in the `extension` directory
4. Submit the ZIP file to the Chrome Web Store

## Troubleshooting

### Common Issues

1. **Report template generation failure**
   - Make sure to build the `@midscene/visualizer` package first
   - Check if `packages/visualizer/dist/report/index.html` exists

2. **React Hooks errors**
   - Check for multiple React instances, might need to adjust the externals configuration in `rsbuild.config.ts`

3. **async_hooks module not found**
   - Check the alias configuration in `rsbuild.config.ts` to ensure it points correctly to the polyfill file

4. **Extension doesn't work properly after installation**
   - Check for error messages in the Chrome console
   - Verify that the build process was executed completely
   - Validate the permissions configuration in the manifest.json file
