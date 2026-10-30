import { Link } from '@rspress/core/theme-original';
import {
  Blocks,
  Globe,
  type LucideIcon,
  Monitor,
  Smartphone,
  TabletSmartphone,
} from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import './AgentVision.css';

interface Platform {
  name: string;
  packageName: string;
  href: string;
  icon: LucideIcon;
}

export function PlatformHub() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const top: Platform[] = [
    {
      name: t('platformWeb'),
      packageName: '@midscene/web',
      href: '/integrate-with-playwright',
      icon: Globe,
    },
    {
      name: 'Android',
      packageName: '@midscene/android',
      href: '/platforms/android',
      icon: Smartphone,
    },
    {
      name: 'iOS',
      packageName: '@midscene/ios',
      href: '/platforms/ios',
      icon: Smartphone,
    },
  ];
  const bottom: Platform[] = [
    {
      name: 'HarmonyOS',
      packageName: '@midscene/harmony',
      href: '/platforms/harmonyos',
      icon: TabletSmartphone,
    },
    {
      name: t('platformDesktop'),
      packageName: '@midscene/computer',
      href: '/platforms/desktop',
      icon: Monitor,
    },
    {
      name: t('platformCustom'),
      packageName: '@midscene/core',
      href: '/integrate-with-any-interface',
      icon: Blocks,
    },
  ];

  const renderTile = (
    { name, packageName, href, icon: Icon }: Platform,
    row: 'top' | 'bottom',
  ) => (
    <Link
      key={packageName}
      href={tUrl(href)}
      className={`platform-hub__tile platform-hub__tile--${row}`}
    >
      <span className="platform-hub__icon" aria-hidden="true">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <strong>{name}</strong>
      <code>{packageName}</code>
    </Link>
  );

  return (
    <div className="platform-hub">
      {top.map((platform) => renderTile(platform, 'top'))}
      <div className="platform-hub__api">
        <span className="platform-hub__api-label">
          {t('platformsApiLabel')}
        </span>
        <code>
          <span>await</span> agent.<strong>aiAct</strong>(
          <span>'{t('platformsApiPrompt')}'</span>)
        </code>
      </div>
      {bottom.map((platform) => renderTile(platform, 'bottom'))}
    </div>
  );
}
