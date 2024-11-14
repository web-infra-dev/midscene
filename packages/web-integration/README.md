## Documentation

An AI-powered automation SDK can control the page, perform assertions, and extract data in JSON format using natural language.

See https://midscenejs.com/ for details.

## iOS/Android prerequisites

iOS/Android is driven by appium, so you need the following Appium tool chain first:
- [CLI](https://appium.io/docs/en/latest/quickstart/install/)
- Driver
  - [iOS](https://github.com/appium/appium-xcuitest-driver)
  - [Android](https://github.com/appium/appium-uiautomator2-driver)
- [Plugin](https://github.com/appium/appium/tree/master/packages/universal-xml-plugin)

then execute the command to start appium server:

```bash
appium --use-plugins=universal-xml
```

now you can use run tests for iOS/Android devices:

```bash
npm run test:ai -- appium
```

## License

Midscene is MIT licensed.