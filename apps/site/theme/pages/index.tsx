import { Banner } from '../components/Banner';
import { CTAButtons } from '../components/CTAButtons';
import { FeatureSections } from '../components/FeatureSections';
import { SectionDivider } from '../components/SectionDivider';
import { WhoIsUsing } from '../components/WhoIsUsing';
import { useI18n } from '../i18n';

const CopyRight = () => {
  const t = useI18n();

  return (
    <footer className="home-footer">
      <div className="home-footer__inner">
        <p>{t('licenseNotice')}</p>
        <p>{t('copyrightNotice')}</p>
      </div>
    </footer>
  );
};

export function HomeLayout() {
  const t = useI18n();

  return (
    <div className="home-page">
      {/* Banner Section */}
      <Banner />

      {/* Feature Sections */}
      <FeatureSections />

      {/* Who is Using */}
      <WhoIsUsing />

      <div className="home-bottom">
        {/* Bottom CTA Section */}
        <section
          className="home-bottom-cta"
          aria-labelledby="home-bottom-cta-title"
        >
          <div className="home-bottom-cta__inner">
            <h2 id="home-bottom-cta-title">{t('bottomCtaTitle')}</h2>
            <CTAButtons />
          </div>
        </section>

        <SectionDivider className="home-footer__divider" />

        {/* Copyright */}
        <CopyRight />
      </div>
    </div>
  );
}
