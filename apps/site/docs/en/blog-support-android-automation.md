# Support Android Automation

From Midscene v0.15.0, we are happy to announce the support for Android automation!

## Demos first

Here are some demos to show you the power of the automation:

______________

______________

______________

## Suitable for ALL apps

For our developers, all you need is the adb connection and a visual-language model (vl-model) service. Everything is ready!

Behind the scenes, we utilize the visual grounding capabilities of vl-model to locate target elements on the screen. So, regardless of whether it's a native app or a hybrid app with a webview, it makes no difference. Developers can write automation scripts without the burden of worrying about the technology stack of the app.

## With ALL the power of Midscene

When using Midscene to do web automation, our users loves the tools like playgrounds and reports. Now, we bring the same power to Android automation!

You can use the playground to run automation without any code:

_____________

Use the report to replay the whole process:

_____________

To write the automation scripts by yaml file:

_____________

Or use the javascript SDK:

_____________

We have prepared a demo project for javascript SDK:

_____________

If you want to use the automation for testing purpose, you can use the javascript with vitest. We have setup a demo project for you to see how it works:

_____________

## Limitations

1. Caching feature for element locator is not supported. Since no view-hierarchy is collected, we cannot cache the element identifier and reuse it.
2. LLMs like gpt-4o is not supported. Only some known vl models with visual grounding ability are supported for now. If you want to introduce other vl models, please let us know.
3. The performance is not good enough for now. We are still working on it.
