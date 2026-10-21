import { Link } from '@rspress/core/theme-original';
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
      href: '/integrate-with-playwright',
    },
    {
      name: 'Android',
      packageName: '@midscene/android',
      access: t('platformAndroidAccess'),
      href: '/platforms/android',
    },
    {
      name: 'iOS',
      packageName: '@midscene/ios',
      access: t('platformIosAccess'),
      href: '/platforms/ios',
    },
    {
      name: 'HarmonyOS',
      packageName: '@midscene/harmony',
      access: t('platformHarmonyAccess'),
      href: '/platforms/harmonyos',
    },
    {
      name: t('platformDesktop'),
      packageName: '@midscene/computer',
      access: t('platformDesktopAccess'),
      href: '/platforms/desktop',
    },
    {
      name: t('platformCustom'),
      packageName: '@midscene/core',
      access: t('platformCustomAccess'),
      href: '/integrate-with-any-interface',
    },
  ];

  return (
    <div className="home-platform-table-wrapper">
      <table className="home-platform-table" aria-label={t('clientsHeading')}>
        <thead>
          <tr>
            <th scope="col">{t('platformColumnName')}</th>
            <th scope="col">{t('platformColumnPackage')}</th>
            <th scope="col">{t('platformColumnDescription')}</th>
          </tr>
        </thead>
        <tbody>
          {platforms.map(({ name, packageName, access, href }) => (
            <tr key={packageName}>
              <td>
                <Link href={tUrl(href)}>
                  <strong>{name}</strong>
                </Link>
              </td>
              <td>{packageName}</td>
              <td>{access}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
