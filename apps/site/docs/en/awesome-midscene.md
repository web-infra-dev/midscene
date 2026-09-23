# Awesome Midscene

A curated list of community projects that extend Midscene.js capabilities across different platforms and programming languages.

## Community projects

### [lhuanyu/midscene-ios](https://github.com/lhuanyu/midscene-ios)

iOS Mirror automation support for Midscene

- Enables automated testing and interaction with iOS applications
- Extends Midscene's cross-platform capabilities to Apple's mobile ecosystem

### [lhuanyu/midscene-android](https://github.com/lhuanyu/midscene-android)

An Android app that runs Midscene automation directly on the device, without connecting to it from a PC via ADB

- Operate apps with natural-language instructions, edit and run YAML scripts, and review execution reports and history on the device
- Follow task progress through a floating overlay and interrupt execution when needed
- The Agent and runtime run on the device; prompts and screenshots are sent to the model endpoint you configure

### [Mofangbao/midscene-pc](https://github.com/Mofangbao/midscene-pc)

PC operation device for Windows, macOS, and Linux

- Enables automated testing and interaction with desktop applications across all major platforms
- Supports both local and remote operation capabilities

### [Mofangbao/midscene-pc-docker](https://github.com/Mofangbao/midscene-pc-docker)

Docker container image with Midscene-PC server pre-installed

- Based on Ubuntu 20 with GNOME desktop for maximum application compatibility
- Includes built-in VNC service for browser-based desktop monitoring
- Deploy automation client directly on standard servers with a single command

### [Python51888/Midscene-Python](https://github.com/Python51888/Midscene-Python)

Python SDK for Midscene automation

- Brings Midscene's AI-powered automation capabilities to Python developers
- Allows integration with existing Python testing and automation workflows

### [Master-Frank/midscene-java](https://github.com/Master-Frank/midscene-java)

Java SDK for Midscene automation

- Offers a JVM-friendly way to script Midscene experiences similar to the Python SDK
- Fits easily into existing Java automation or testing pipelines

### [alstafeev/midscene-java](https://github.com/alstafeev/midscene-java)

Java SDK for Midscene automation

- Provides a JVM-native interface for scripting Midscene
- Integrates seamlessly into established Java testing frameworks and automation workflows

### [KiritoKing/midscene-jev-runner](https://github.com/KiritoKing/midscene-jev-runner)

Browser automation with the [Jev](https://typesafe.ai/) decision model for Playwright and Midscene Test

- Turns page controls and available operations into candidates for Jev to choose the next action and target; calls a text generation model when text input is needed
- Works with an existing Playwright page or as a `jevAct` step in Midscene Test, with support for custom task completion checks

## Contributing

Have you created a project that extends Midscene.js? We'd love to feature it here!

To add your project to this list, please submit an issue to the [Midscene repository](https://github.com/web-infra-dev/midscene), and tell us your awesome midscene project.

## Criteria for inclusion

Projects featured in Awesome Midscene should:
- Extend or integrate with Midscene.js functionality
- Be actively maintained
- Have clear documentation and usage examples
- Provide value to the Midscene community

---

*Don't see your favorite platform or language supported yet? Consider creating a community project or contributing to existing ones!*
