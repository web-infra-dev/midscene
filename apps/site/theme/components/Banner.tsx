import { Link } from '@rspress/core/theme-original';
import { useI18n } from '../i18n';
import { CTAButtons } from './CTAButtons';
import { SectionDivider } from './SectionDivider';

const lightVideo =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene-banner-light.mp4';
const darkVideo =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene-banner-dark.mp4';

const heroAssetBase =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/luljzkpt/ljhwZthlaukjlkulzlp/homepage';
const heroAssets = {
  light: {
    pattern: `${heroAssetBase}/hero-pattern-light.png`,
    screen: `${heroAssetBase}/hero-screen-light.png`,
  },
  dark: {
    pattern: `${heroAssetBase}/hero-pattern-dark.png`,
    screen: `${heroAssetBase}/hero-screen-dark.png`,
  },
} as const;

function BrowserPreview({ theme }: { theme: 'light' | 'dark' }) {
  const isLight = theme === 'light';
  const screen = heroAssets[theme].screen;

  return (
    <div className={`home-hero__browser home-hero__browser--${theme}`}>
      <div
        className="home-hero__screen"
        style={{
          backgroundImage: `url(${screen})`,
        }}
      >
        <video
          src={isLight ? lightVideo : darkVideo}
          poster={screen}
          autoPlay
          muted
          loop
          playsInline
          controls={false}
          preload="auto"
        />
      </div>
    </div>
  );
}

export function Banner() {
  const t = useI18n();

  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <img
        className="home-hero__pattern home-hero__pattern--light"
        src={heroAssets.light.pattern}
        alt=""
        aria-hidden="true"
      />
      <img
        className="home-hero__pattern home-hero__pattern--dark"
        src={heroAssets.dark.pattern}
        alt=""
        aria-hidden="true"
      />

      <div className="home-hero__stage">
        <div className="home-hero__copy">
          <div className="home-hero__eyebrow">
            <span aria-hidden="true">{'//'}</span>
            <span>{t('newBadge')}</span>
            <span className="home-hero__eyebrow-divider" aria-hidden="true">
              |
            </span>
            <Link href="./model-common-config#deepseek">
              {t('changelogLink')}
            </Link>
          </div>

          <div className="home-hero__message">
            <h1 id="home-hero-title">
              {t('heroTitle')
                .split('\n')
                .map((line) => (
                  <span key={line}>{line}</span>
                ))}
            </h1>
            <p>{t('heroSubtitle')}</p>
          </div>

          <CTAButtons variant="hero" />

          <div className="home-hero__stats">
            <div className="home-hero__stat">
              <strong>14k+</strong>
              <span>{t('githubStars')}</span>
            </div>
            <div className="home-hero__stat">
              <strong>#2</strong>
              <span>{t('activeUsers')}</span>
            </div>
          </div>
        </div>

        <div className="home-hero__visual" aria-hidden="true">
          <BrowserPreview theme="light" />
          <BrowserPreview theme="dark" />
        </div>

        <div className="home-hero__fade" aria-hidden="true" />
      </div>

      <SectionDivider className="home-hero__divider" />
    </section>
  );
}
