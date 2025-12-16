import { HomeBackground } from '@rspress/core/theme';
import { Banner } from '../components/Banner';
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
      <HomeBackground style={{ background: 'none' }} />

      {/* Banner Section */}
      <Banner />

      {/* Feature Sections */}
      <FeatureSections />

      {/* Copyright */}
      <CopyRight />
    </>
  );
}
