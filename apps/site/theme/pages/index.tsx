import { HomeBackground } from '@rspress/core/theme';
import { Banner } from '../components/Banner';
import { FeatureSections } from '../components/FeatureSections';

export function HomeLayout() {
  return (
    <>
      {/* For transparent nav at top */}
      <HomeBackground style={{ background: 'none' }} />

      {/* Banner Section */}
      <Banner />

      {/* Feature Sections */}
      <FeatureSections />
    </>
  );
}
