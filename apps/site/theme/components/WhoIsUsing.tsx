import { useI18n } from '../i18n';

type LogoOnly = {
  kind: 'logo';
  name: string;
  url: string;
  logo: string;
  logoWidth: number;
};

type IconText = {
  kind: 'iconText';
  name: string;
  url: string;
  icon: string;
  text: string;
};

type Company = LogoOnly | IconText;

export function WhoIsUsing() {
  const t = useI18n();

  const companyList: Company[] = [
    {
      kind: 'iconText',
      name: 'ByteDance',
      url: 'https://www.bytedance.com',
      icon: '/icon/bytedance-color.svg',
      text: 'ByteDance',
    },
    {
      kind: 'iconText',
      name: t('userVolcengine'),
      url: 'https://www.volcengine.com',
      icon: '/images/users/volcengine.png',
      text: t('userVolcengine'),
    },
    {
      kind: 'iconText',
      name: t('userDouyin'),
      url: 'https://www.douyin.com',
      icon: '/images/users/douyin-color.svg',
      text: t('userDouyin'),
    },
    {
      kind: 'iconText',
      name: 'TikTok',
      url: 'https://www.tiktok.com',
      icon: '/images/users/tiktok-color.svg',
      text: 'TikTok',
    },
    {
      kind: 'iconText',
      name: t('userLark'),
      url: 'https://www.larksuite.com',
      icon: '/images/users/lark-color.svg',
      text: t('userLark'),
    },
    {
      kind: 'iconText',
      name: t('userSodaMusic'),
      url: 'https://www.douyin.com/qishui',
      icon: '/images/users/soda-music-color.svg',
      text: t('userSodaMusic'),
    },
    {
      kind: 'iconText',
      name: t('userDoubao'),
      url: 'https://www.doubao.com',
      icon: '/images/users/doubao-color.png',
      text: t('userDoubao'),
    },
    {
      kind: 'iconText',
      name: t('userAlibaba'),
      url: 'https://www.alibaba.com',
      icon: '/images/users/alibaba-color.svg',
      text: t('userAlibaba'),
    },
    {
      kind: 'iconText',
      name: t('userCtrip'),
      url: 'https://www.ctrip.com',
      icon: '/images/users/ctrip-color.svg',
      text: t('userCtrip'),
    },
    {
      kind: 'logo',
      name: 'AVATR',
      url: 'https://www.avatr.com',
      logo: '/images/users/avatr-wordmark.svg',
      logoWidth: 76,
    },
    {
      kind: 'iconText',
      name: t('userXiaomi'),
      url: 'https://www.mi.com',
      icon: '/images/users/xiaomi-color.svg',
      text: t('userXiaomi'),
    },
    {
      kind: 'logo',
      name: t('userIqiyi'),
      url: 'https://www.iqiyi.com',
      logo: '/images/users/iqiyi-color.svg',
      logoWidth: 200,
    },
    {
      kind: 'logo',
      name: t('userBilibili'),
      url: 'https://www.bilibili.com',
      logo: t('userBilibiliLogo'),
      logoWidth: Number(t('userBilibiliLogoWidth')),
    },
    {
      kind: 'logo',
      name: 'Autel',
      url: 'https://autelenergy.com',
      logo: '/images/users/autel-color.svg',
      logoWidth: 140,
    },
    {
      kind: 'logo',
      name: t('userDongchedi'),
      url: 'https://www.dongchedi.com',
      logo: '/images/users/dongchedi-color.svg',
      logoWidth: 140,
    },
  ];

  return (
    <section id="who-is-using" className="home-users">
      <div className="home-users__inner">
        <header className="home-users__header">
          <span className="home-users__eyebrow">
            <span aria-hidden="true">{'//'}</span>
            <span>{t('whoIsUsingEyebrow')}</span>
          </span>
          <h2>{t('whoIsUsingTitle')}</h2>
        </header>

        <div className="home-users__list">
          {companyList.map((company) => (
            <a
              key={company.name}
              href={company.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={company.name}
              className={`home-company-pill home-company-pill--${
                company.kind === 'logo' ? 'logo' : 'text'
              }`}
            >
              {company.kind === 'logo' ? (
                <span className="home-company-pill__logo-shell">
                  <img
                    src={company.logo}
                    alt={company.name}
                    style={{ width: company.logoWidth }}
                    loading="lazy"
                  />
                </span>
              ) : (
                <>
                  <span className="home-company-pill__icon">
                    <img src={company.icon} alt="" loading="lazy" />
                  </span>
                  <span className="home-company-pill__label">
                    {company.text}
                  </span>
                </>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
