import { useI18n } from '../i18n';
import { SectionDivider } from './SectionDivider';

const heroAssetBase =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/luljzkpt/ljhwZthlaukjlkulzlp/homepage';
const heroAssets = {
  light: {
    pattern: `${heroAssetBase}/hero-pattern-light.png`,
  },
  dark: {
    pattern: `${heroAssetBase}/hero-pattern-dark.png`,
  },
} as const;

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

          <HeroStats />
        </div>
      </div>

      <SectionDivider className="home-hero__divider" />
    </section>
  );
}

export function HeroStats() {
  const t = useI18n();
  return (
    <div className="home-hero__stats">
      <div className="home-hero__stat">
        <strong>{__MIDSCENE_GITHUB_STARS__}</strong>
        <span>{t('githubStars')}</span>
      </div>
      <a
        className="home-hero__stat"
        href="https://github.com/web-infra-dev/midscene/blob/main/LICENSE"
      >
        <strong>MIT</strong>
        <span>{t('openSource')}</span>
      </a>
      <div className="home-hero__stat">
        <strong>#2</strong>
        <span>{t('activeUsers')}</span>
      </div>
    </div>
  );
}
