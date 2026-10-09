import { CodeBlockRuntime, Tab, Tabs } from '@rspress/core/theme';
import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import './TestFramework.css';

export function TestFramework() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const yaml = `beforeEach:
  - user.create: { name: Alice }
  - gotoUrl: https://your-app.example/users

cases:
  - name: ${t('frameworkCase')}
    steps:
      - aiAct: ${t('frameworkAct')}
      - aiAssert: ${t('frameworkAssert')}`;
  const node = `import { defineNode, z } from '@midscene/test';
import { userService } from './user-service';

export const createUser = defineNode({
  name: 'user.create',
  description: ${JSON.stringify(t('frameworkNodeDescription'))},
  inputSchema: z.strictObject({ name: z.string() }),
  async execute({ input, onTeardown }) {
    const user = await userService.create(input);
    onTeardown(() => userService.remove(user.id));
  },
});`;
  const spec = [
    '### `user.create`',
    '',
    t('frameworkNodeDescription'),
    '',
    '**String shorthand:** Not supported by this Node.',
    '',
    '#### Input Schema',
    '',
    '```json',
    '{',
    '  "type": "object",',
    '  "properties": { "name": { "type": "string" } },',
    '  "required": ["name"]',
    '}',
    '```',
    '',
    `<!-- ${t('frameworkSpecOmitted')} -->`,
  ].join('\n');
  const examples = [
    {
      label: t('frameworkYamlTab'),
      file: 'cases/users.yaml',
      lang: 'yaml',
      code: yaml,
      note: t('frameworkYamlNote'),
    },
    {
      label: t('frameworkNodeTab'),
      file: 'nodes.ts',
      lang: 'typescript',
      code: node,
      note: t('frameworkNodeNote'),
    },
    {
      label: 'Node Spec',
      file: 'midscene-node-spec.md',
      lang: 'markdown',
      code: spec,
      note: t('frameworkSpecNote'),
    },
  ];
  return (
    <section
      className="home-feature home-framework"
      aria-labelledby="home-framework-title"
    >
      <div className="home-feature__inner home-framework__layout">
        <div className="home-framework__copy">
          <header className="home-feature__heading-block">
            <span className="home-feature__eyebrow">
              <span aria-hidden="true">{'//'}</span>@midscene/test
            </span>
            <h2 id="home-framework-title">{t('frameworkHeading')}</h2>
          </header>
          <div className="home-framework__points">
            <div>
              <h3>{t('frameworkYamlTitle')}</h3>
              <p>{t('frameworkYamlDesc')}</p>
            </div>
            <div>
              <h3>{t('frameworkNodeTitle')}</h3>
              <p>{t('frameworkNodeDesc')}</p>
            </div>
            <div>
              <h3>{t('frameworkSpecTitle')}</h3>
              <p>{t('frameworkSpecDesc')}</p>
            </div>
          </div>
          <Link
            className="home-framework__link"
            href={tUrl('/midscene-test/overview')}
          >
            {t('frameworkLink')}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="home-framework__examples">
          <Tabs defaultValue="yaml">
            {examples.map((example) => (
              <Tab
                key={example.file}
                label={example.label}
                value={example.lang === 'yaml' ? 'yaml' : example.file}
              >
                <CodeBlockRuntime
                  lang={example.lang}
                  code={[
                    example.lang === 'markdown'
                      ? `<!-- ${example.file}\n${example.note} -->`
                      : [example.file, example.note]
                          .map(
                            (line) =>
                              `${example.lang === 'yaml' ? '#' : '//'} ${line}`,
                          )
                          .join('\n'),
                    example.code,
                  ].join('\n\n')}
                  wrapCode
                  codeButtonGroupProps={{ showWrapCodeButton: false }}
                />
              </Tab>
            ))}
          </Tabs>
        </div>
      </div>
    </section>
  );
}
