# Consume Report Files (Beta)

Midscene HTML report files capture the full execution history of a single Agent, making them useful for replay and debugging.

Starting in v1.7.0, you can extract raw screenshots and JSON data from a report file, or convert the report into Markdown so other tools can consume it.

## Example

Here is a demo workflow: use the [Remotion Skill](https://www.remotion.dev/docs/ai/skills?utm_source=midscenejs) to parse a Midscene Markdown report and generate a customized replay video.

After installing the Skills, you can use a prompt like this:

```text
Generate a space-themed Remotion replay video based on the contents of report.md.
```

The generated video looks like this:

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/midscene-replay.mp4" height="300" controls></video>

## Parse With The CLI

The report parsing tool is included in each platform CLI package, such as `@midscene/web` and `@midscene/android`. The subcommand is `report-tool`.

Extract report contents as JSON and export the related screenshots into the `output-data` directory:

```shell
npx @midscene/web report-tool --action split --htmlPath ./midscene_run/report/puppeteer-2026/index.html --outputDir ./output-data
```

Convert the report file into Markdown and write the result into the `output-markdown` directory:

```shell
npx @midscene/web report-tool --action to-markdown --htmlPath ./midscene_run/report/puppeteer-2026/index.html --outputDir ./output-markdown
```

## About Fields In JSON And Markdown

The JSON and Markdown structures parsed from report files may change as Midscene evolves.
