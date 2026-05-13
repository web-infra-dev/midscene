import { useI18n } from '../i18n';

type LogoOnly = {
  kind: 'logo';
  name: string;
  url: string;
  logo: string;
  logoWidth: number;
  invertOnDark?: boolean;
};

type IconText = {
  kind: 'iconText';
  name: string;
  url: string;
  icon: string;
  iconSize: number;
  text: string;
  invertIconOnDark?: boolean;
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
      iconSize: 40,
      text: 'ByteDance',
    },
    {
      kind: 'iconText',
      name: t('userVolcengine'),
      url: 'https://www.volcengine.com',
      icon: '/images/users/volcengine.png',
      iconSize: 40,
      text: t('userVolcengine'),
    },
    {
      kind: 'iconText',
      name: t('userDouyin'),
      url: 'https://www.douyin.com',
      icon: '/images/users/douyin-color.svg',
      iconSize: 40,
      text: t('userDouyin'),
    },
    {
      kind: 'iconText',
      name: 'TikTok',
      url: 'https://www.tiktok.com',
      icon: '/images/users/tiktok-color.svg',
      iconSize: 40,
      text: 'TikTok',
    },
    {
      kind: 'iconText',
      name: t('userAlibaba'),
      url: 'https://www.alibaba.com',
      icon: '/images/users/alibaba-color.svg',
      iconSize: 40,
      text: t('userAlibaba'),
    },
    {
      kind: 'logo',
      name: 'AVATR',
      url: 'https://www.avatr.com',
      logo: '/avatr.png',
      logoWidth: 140,
      invertOnDark: true,
    },
    {
      kind: 'iconText',
      name: t('userXiaomi'),
      url: 'https://www.mi.com',
      icon: '/images/users/xiaomi-color.svg',
      iconSize: 40,
      text: t('userXiaomi'),
    },
  ];

  return (
    <section
      id="who-is-using"
      className="w-full bg-white dark:bg-[#121212] py-16 md:py-20"
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-10 flex flex-col items-center gap-y-10 md:gap-y-14">
        <h2 className="font-sans font-semibold text-[28px] md:text-[40px] leading-[32px] md:leading-[48px] text-center text-black dark:text-white">
          {t('whoIsUsingTitle')}
        </h2>
        <div className="w-full flex flex-wrap items-center justify-center gap-x-10 md:gap-x-14 gap-y-10 md:gap-y-12">
          {companyList.map((company) => (
            <a
              key={company.name}
              href={company.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={company.name}
              className="flex items-center justify-center h-20 md:h-24 opacity-70 hover:opacity-100 transition-opacity duration-200"
            >
              {company.kind === 'logo' ? (
                <img
                  src={company.logo}
                  alt={company.name}
                  style={{ width: company.logoWidth, maxWidth: '100%' }}
                  className={`h-auto max-h-full object-contain ${
                    company.invertOnDark ? 'dark:invert' : ''
                  }`}
                  loading="lazy"
                />
              ) : (
                <div className="flex items-center gap-3">
                  <img
                    src={company.icon}
                    alt=""
                    style={{
                      width: company.iconSize,
                      height: company.iconSize,
                    }}
                    className={`object-contain ${
                      company.invertIconOnDark ? 'dark:invert' : ''
                    }`}
                    loading="lazy"
                  />
                  <span className="font-sans font-bold text-2xl md:text-3xl text-black dark:text-white whitespace-nowrap">
                    {company.text}
                  </span>
                </div>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
