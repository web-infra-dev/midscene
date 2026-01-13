import { HomeBackground } from '@rspress/core/theme-original';
import { Banner } from '../components/Banner';
import { CTAButtons } from '../components/CTAButtons';
import { FeatureSections } from '../components/FeatureSections';

const CopyRight = () => {
  return (
    <footer className="bottom-0 mt-12 py-8 px-6 sm:p-8 w-full border-t border-solid border-gray-200 dark:border-gray-800">
      <div className="m-auto w-full text-center">
        <div className="font-medium text-sm text-gray-600 dark:text-gray-400">
          <p className="mb-2">
            Midscene is free and open source software released under the MIT
            license.
          </p>
          <p>© 2024-present ByteDance Inc. and its affiliates.</p>
        </div>
      </div>
    </footer>
  );
};

export function HomeLayout() {
  return (
    <>
      {/* For transparent nav at top */}
      <HomeBackground
        className="block dark:hidden"
        style={{
          backgroundImage: 'url(/midscene-light-bg.png)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      />
      <HomeBackground
        className="hidden dark:block"
        style={{
          backgroundImage: 'url(/midscene-dark-bg.png)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      />

      {/* Banner Section */}
      <Banner />

      {/* Feature Sections */}
      <FeatureSections />

      {/* Bottom CTA Section */}
      <div className="w-full bg-white dark:bg-[#121212] py-12 md:py-20">
        <div className="max-w-[1200px] mx-auto px-5 md:px-10 flex justify-center">
          <CTAButtons />
        </div>
      </div>

      {/* Copyright */}
      <CopyRight />
    </>
  );
}
