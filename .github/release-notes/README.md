# Release highlights

Before a `major` or `minor` release, write both files for the target version:

- `vX_Y_Z.highlight.en.md`: English highlights.
- `vX_Y_Z.highlight.zh.md`: Chinese highlights.

Both must contain meaningful content. Patch releases may omit highlights; if
provided, both languages are required. Prereleases do not require highlights.

Describe the key changes and how to use them. Use ordinary Markdown with `##`
feature headings and absolute HTTPS links. Do not edit `*.auto_generated.*.md`;
the release script generates these files and updates the website changelogs
and GitHub Release.
