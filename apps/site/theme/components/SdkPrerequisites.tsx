import React from 'react';

const nodeVersion = '^20.19.0 || ^22.12.0 || >=24.0.0';

type SdkPrerequisitesProps = {
  lang: 'en' | 'zh';
  mode: 'playwright' | 'vitest' | 'standalone';
};

// Keep section headings in MDX so Rspress includes them in the table of contents.
export function SdkPrerequisites({ lang, mode }: SdkPrerequisitesProps) {
  if (lang === 'en') {
    return (
      <ul>
        <li>
          <strong>Runtime</strong>
          {': Install Node.js '}
          <code>{nodeVersion}</code>
          {' and pnpm. '}
          {mode === 'playwright' ? (
            <>
              {
                'Have an existing Playwright Test project that can run tests with Chromium.'
              }
            </>
          ) : (
            <>
              {'Use an existing project or run '}
              <code>pnpm init</code>
              {' to create one (skip if '}
              <code>package.json</code>
              {' already exists).'}
            </>
          )}
        </li>
        <li>
          <strong>Model configuration and verification</strong>
          {': Complete '}
          <a href="/model-api-setup">model configuration</a>
          {' and '}
          <a href="/model-config#verify-model-connectivity">
            model verification
          </a>
          {", then save the configuration in the project's "}
          <code>.env</code>
          {' file or shell environment.'}
        </li>
        <li>
          {mode === 'playwright' ? (
            <>
              <strong>Platform environment</strong>
              {
                ': Install Chromium and make sure the browser can access the target page.'
              }
            </>
          ) : mode === 'vitest' ? (
            <>
              <strong>Platform environment</strong>
              {': Complete the environment setup for '}
              <a href="/platforms/android">Android</a>
              {', '}
              <a href="/platforms/ios">iOS</a>
              {', '}
              <a href="/platforms/harmonyos">HarmonyOS</a>
              {', or '}
              <a href="/platforms/desktop">desktop</a>
              {', including device connections and required permissions.'}
            </>
          ) : (
            <>
              <strong>Platform environment</strong>
              {
                ': Prepare the target browser or device, including connections and required permissions. For mobile and desktop, complete the setup for '
              }
              <a href="/platforms/android">Android</a>
              {', '}
              <a href="/platforms/ios">iOS</a>
              {', '}
              <a href="/platforms/harmonyos">HarmonyOS</a>
              {', or '}
              <a href="/platforms/desktop">desktop</a>
              {'; for Chrome Bridge, install the '}
              <a href="/quick-start#chrome-extension">Chrome extension</a>
              {
                '. The browser installation command for Web / Playwright is included in the example below.'
              }
            </>
          )}
        </li>
        <li>
          <strong>(Optional) Try Playground first</strong>
          {
            ': Run an action and an assertion against your target interface in the '
          }
          {mode === 'playwright' ? (
            <>
              <a href="/quick-start#chrome-extension">
                Chrome extension Playground
              </a>
            </>
          ) : (
            <>
              <a href="/quick-start">Playground for your platform</a>
            </>
          )}
          {' to verify screenshots, interactions, and model behavior.'}
        </li>
      </ul>
    );
  }
  if (lang === 'zh') {
    return (
      <ul>
        <li>
          <strong>运行环境</strong>
          {'：已安装 Node.js（版本要求 '}
          <code>{nodeVersion}</code>
          {'）和 pnpm。'}
          {mode === 'playwright' ? (
            <>{'已准备好可使用 Chromium 运行测试的 Playwright Test 项目。'}</>
          ) : (
            <>
              {'可使用已有项目；新项目请先执行 '}
              <code>pnpm init</code>
              {'（已有 '}
              <code>package.json</code>
              {' 可跳过）。'}
            </>
          )}
        </li>
        <li>
          <strong>模型配置与验证</strong>
          {'：已完成'}
          <a href="/zh/model-api-setup">模型配置</a>
          {'并通过'}
          <a href="/zh/model-config#verify-model-connectivity">模型验证</a>
          {'，且已将配置保存在项目的 '}
          <code>.env</code>
          {' 文件或当前 Shell 环境中。'}
        </li>
        <li>
          {mode === 'playwright' ? (
            <>
              <strong>平台环境</strong>
              {'：已安装 Chromium，且浏览器能够访问待测页面。'}
            </>
          ) : mode === 'vitest' ? (
            <>
              <strong>平台环境</strong>
              {'：已完成目标平台的环境准备：'}
              <a href="/zh/platforms/android">Android</a>
              {'、'}
              <a href="/zh/platforms/ios">iOS</a>
              {'、'}
              <a href="/zh/platforms/harmonyos">HarmonyOS</a>
              {' 或'}
              <a href="/zh/platforms/desktop">桌面端</a>
              {'，设备连接与权限已就绪。'}
            </>
          ) : (
            <>
              <strong>平台环境</strong>
              {
                '：已备好目标浏览器或设备，并完成连接与权限配置。移动端和桌面端请先完成 '
              }
              <a href="/zh/platforms/android">Android</a>
              {'、'}
              <a href="/zh/platforms/ios">iOS</a>
              {'、'}
              <a href="/zh/platforms/harmonyos">HarmonyOS</a>
              {' 或'}
              <a href="/zh/platforms/desktop">桌面端</a>
              {'的环境准备；Chrome Bridge 需安装 '}
              <a href="/zh/quick-start#chrome-extension">Chrome 插件</a>
              {'；Web / Playwright 的浏览器安装命令包含在下方示例中。'}
            </>
          )}
        </li>
        <li>
          <strong>（可选）试用 Playground</strong>
          {'：建议先在'}
          {mode === 'playwright' ? (
            <>
              <a href="/zh/quick-start#chrome-extension">
                Chrome 插件 Playground
              </a>
            </>
          ) : (
            <>
              <a href="/zh/quick-start">对应平台的 Playground</a>
            </>
          )}
          {'中对目标界面试跑一次操作和断言，确认截图、交互与模型表现正常。'}
        </li>
      </ul>
    );
  }
  throw new Error(`Unsupported SDK prerequisites language: ${lang}`);
}
