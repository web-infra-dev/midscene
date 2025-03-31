# Midscene Report

Midscene Report is a visualization application for displaying test execution results from Midscene.js. It provides an interactive interface for viewing and analyzing test execution data.

Visit our website: [https://midscene.js.org](https://midscene.js.org)

## Features

- Visual display of test execution results
- Multi-test case switching support
- Detailed execution timeline
- Test replay functionality
- Responsive layout design

## Requirements

- Node.js >= 16
- pnpm >= 8

## Getting Started

For detailed environment setup instructions, please refer to the [Contribution Guide](../../CONTRIBUTING.md) in the root directory.

### Installation

```bash
pnpm install
```

### Development

Start the development server:

```bash
pnpm dev
```

### Build

Build for production:

```bash
pnpm build
```

### Preview

Preview the production build locally:

```bash
pnpm preview
```

## Tech Stack

- React 18
- TypeScript
- Ant Design
- Rsbuild
- Zustand (State Management)
- PIXI.js (Graphics Rendering)

## Project Structure

```
src/
  ├── components/     # React Components
  ├── assets/        # Static Assets
  ├── template/      # HTML Templates
  └── types.ts       # Type Definitions
```
