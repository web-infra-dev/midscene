# Data privacy

⁠Midscene.js is an open-source project (GitHub: [Midscene](https://github.com/web-infra-dev/midscene/)) under the MIT license. You can see all the codes in the public repository.

The Midscene project does not collect your screenshots, API keys, or access tokens through the SDK. During AI steps, the SDK sends the required screenshots, prompts, and page context directly to the model service you configure. That service’s privacy policy governs how it stores and uses this data.

By default, Midscene saves reports and logs on the machine running the task, under `midscene_run/report` and `midscene_run/log`. If your scripts, application screens, or execution results contain sensitive information such as plaintext tokens or cookies, that information may also appear in reports and logs. Manage access and retention, and remove sensitive content before sharing. In CI, console logs and uploaded artifacts may also be visible to people with access to the job.

If you prefer building Midscene.js and its Chrome Extension in your own environment instead of using the published versions, you can refer to the [Contributing Guide](https://github.com/web-infra-dev/midscene/blob/main/CONTRIBUTING.md) to find building instructions.
