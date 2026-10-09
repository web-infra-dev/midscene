import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import './PlatformTable.css';

export function PlatformTable() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const platforms = [
    {
      name: t('platformWeb'),
      packageName: '@midscene/web',
      access: t('platformWebAccess'),
      links: [
        ['Playwright', '/integrate-with-playwright'],
        ['Puppeteer', '/integrate-with-puppeteer'],
        [t('platformBridgeDoc'), '/bridge-mode'],
      ],
    },
    {
      name: t('platformDesktop'),
      packageName: '@midscene/computer',
      access: t('platformDesktopAccess'),
      links: [[t('platformGuide'), '/platforms/desktop']],
    },
    {
      name: 'Android',
      packageName: '@midscene/android',
      access: t('platformAndroidAccess'),
      links: [[t('platformGuide'), '/platforms/android']],
    },
    {
      name: 'iOS',
      packageName: '@midscene/ios',
      access: t('platformIosAccess'),
      links: [[t('platformGuide'), '/platforms/ios']],
    },
    {
      name: 'HarmonyOS',
      packageName: '@midscene/harmony',
      access: t('platformHarmonyAccess'),
      links: [[t('platformGuide'), '/platforms/harmonyos']],
    },
    {
      name: t('platformCustom'),
      packageName: '@midscene/core',
      access: t('platformCustomAccess'),
      links: [[t('platformCustomDoc'), '/integrate-with-any-interface']],
    },
  ];

  return (
    <ul className="home-platform-list" aria-label={t('clientsHeading')}>
      {platforms.map(({ name, packageName, access, links }) => (
        <li className="home-platform-list__row" key={packageName}>
          <div className="home-platform-list__identity">
            <div className="home-platform-list__name">
              <h3>{name}</h3>
              <code>{packageName}</code>
            </div>
          </div>
          <p>{access}</p>
          <div className="home-platform-list__links">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={tUrl(href)}
                aria-label={`${name} · ${label}`}
              >
                {label}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
