import type { ReactNode } from 'react';
import { useI18n, useI18nUrl } from '../i18n';
import { SectionDivider } from './SectionDivider';
import { TiltCard } from './TiltCard';

const GradientIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="icon-gradient" x1="6" y1="0" x2="6" y2="12">
        <stop stopColor="#0555FF" />
        <stop offset="1" stopColor="#CC9AFF" />
      </linearGradient>
    </defs>
    <path d="M5 0H7V5H12V7H7V12H5V7H0V5H5V0Z" fill="url(#icon-gradient)" />
  </svg>
);

function FeatureSectionColumns({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-[1218px] grid-cols-1 items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-14">
      {children}
    </div>
  );
}

interface BenchmarkLinkCardProps {
  href: string;
  score: string;
  title: string;
  details: string;
}

function BenchmarkLinkCard({
  href,
  score,
  title,
  details,
}: BenchmarkLinkCardProps) {
  return (
    <TiltCard
      href={href}
      className="rounded-2xl w-full min-w-0 md:w-[381px] h-[120px] md:h-[185px] flex flex-col justify-center items-center hover:bg-gray-200 dark:hover:bg-[#252525] transition-all duration-200 cursor-pointer group border-2 border-transparent hover:border-[#0555FF] overflow-hidden"
    >
      <div
        className="dark:hidden w-full h-full flex flex-col justify-center items-center bg-cover bg-center rounded-2xl"
        style={{
          backgroundImage: 'url(/images/backgrounds/grid-light.svg)',
        }}
      >
        <div className="font-sans font-semibold text-[#0555FF]">
          <span className="text-[40px] md:text-[56px] leading-none">
            {score}
          </span>
        </div>
        <div className="mt-2 font-sans text-sm text-black/60 text-center">
          <div>{title}</div>
          <div>{details}</div>
        </div>
      </div>
      <div
        className="hidden dark:flex w-full h-full flex-col justify-center items-center rounded-2xl"
        style={{
          backgroundImage: 'url(/images/backgrounds/grid-dark.svg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="font-sans font-semibold text-[#80A8FF]">
          <span className="text-[40px] md:text-[56px] leading-none">
            {score}
          </span>
        </div>
        <div className="mt-2 font-sans text-sm text-white/60 text-center">
          <div>{title}</div>
          <div>{details}</div>
        </div>
      </div>
    </TiltCard>
  );
}

export function FeatureSections() {
  const t = useI18n();
  const tUrl = useI18nUrl();

  return (
    <div className="flex flex-col w-full bg-white dark:bg-[#0a0a0a] px-5 md:px-10 lg:px-0">
      {/* Section 1: CLIENTS */}
      <div className="w-full flex items-center justify-center py-20">
        <FeatureSectionColumns>
          {/* Left side - Text content */}
          <div className="w-full flex flex-col items-start gap-y-4 md:gap-y-8">
            <div className="font-mono font-medium text-sm md:text-base leading-6 bg-gradient-to-r from-[#80A8FF] to-[#0555FF] bg-clip-text text-transparent">
              {t('clientsTitle')}
            </div>
            <h2 className="font-sans font-semibold text-[28px] md:text-[40px] leading-[32px] md:leading-[48px] text-black dark:text-white">
              {t('clientsHeading')}
            </h2>
            <div className="w-full lg:w-[360px] flex flex-col gap-y-3">
              <div className="flex flex-row gap-x-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div className="flex-1 font-sans text-sm md:text-base font-normal leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                  {t('clientsDesc1')}
                </div>
              </div>
              <div className="flex flex-row gap-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div className="flex-1 font-sans text-sm md:text-base font-normal leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                  {t('clientsDesc2')}
                </div>
              </div>
              <div className="flex flex-row gap-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div className="flex-1 font-sans text-sm md:text-base font-normal leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                  {t('clientsDesc3')}
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Cards */}
          <div className="w-full flex flex-col gap-y-6 md:gap-y-10">
            {/* Top row */}
            <div className="flex flex-col md:flex-row gap-6">
              {/* Web Card */}
              <TiltCard
                href={tUrl(t('platformWebLink'))}
                className="w-full md:w-[381px] md:h-[368px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[264px] flex items-center justify-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gradient-light.svg)',
                      }}
                    >
                      <img
                        src="/images/platforms/web-light.png"
                        alt="Web"
                        className="w-[240px] h-[150px]"
                      />
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gradient-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <img
                        src="/images/platforms/web-dark.png"
                        alt="Web"
                        className="w-[240px] h-[150px]"
                      />
                    </div>
                  </div>
                  <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                    {t('platformWeb')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformWebDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* PC Card */}
              <TiltCard
                href={tUrl(t('platformPCLink'))}
                className="w-full md:w-[381px] md:h-[368px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[264px] flex justify-center items-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gradient-light.svg)',
                      }}
                    >
                      <img
                        src="/images/platforms/pc-light.svg"
                        alt="PC"
                        className="w-[240px] h-[150px]"
                      />
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gradient-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <img
                        src="/images/platforms/pc-dark.svg"
                        alt="PC"
                        className="w-[240px] h-[150px]"
                      />
                    </div>
                  </div>
                  <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                    {t('platformPC')}
                  </p>
                  <div className="text-sm md:text-base font-normal font-sans leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformPCDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>

            {/* Bottom row */}
            <div className="flex flex-col md:flex-row gap-6">
              {/* Mobile Card */}
              <TiltCard
                href={tUrl(t('platformMobileLink'))}
                className="w-full md:w-[381px] md:h-[368px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-y-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[264px] flex justify-center items-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl gap-4"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gradient-light.svg)',
                      }}
                    >
                      <img
                        src="/images/platforms/android-light.png"
                        alt="Android"
                        className="w-[90px] h-[186px]"
                      />
                      <img
                        src="/images/platforms/ios-light.png"
                        alt="iOS"
                        className="w-[90px] h-[186px]"
                      />
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl gap-4"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gradient-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <img
                        src="/images/platforms/android-dark.png"
                        alt="Android"
                        className="w-[90px] h-[186px]"
                      />
                      <img
                        src="/images/platforms/ios-dark.png"
                        alt="iOS"
                        className="w-[90px] h-[186px]"
                      />
                    </div>
                  </div>
                  <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                    {t('platformMobile')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformMobileDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* Any Interface Card */}
              <TiltCard
                href={tUrl(t('platformAnyInterfaceLink'))}
                className="w-full md:w-[381px] md:h-[368px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-y-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[264px] flex justify-center items-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gradient-light.svg)',
                      }}
                    >
                      <img
                        src="/images/platforms/any-interface-light.png"
                        alt="Any Interface"
                        className="w-[240px] h-[139px]"
                      />
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gradient-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <img
                        src="/images/platforms/any-interface-dark.png"
                        alt="Any Interface"
                        className="w-[240px] h-[139px]"
                      />
                    </div>
                  </div>
                  <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                    {t('platformAnyInterface')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformAnyInterfaceDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>
          </div>
        </FeatureSectionColumns>
      </div>

      {/* Divider */}
      <SectionDivider className="home-feature__divider" />

      {/* Section 2: MODELS */}
      <div className="w-full flex items-center justify-center py-20">
        <FeatureSectionColumns>
          {/* Left side - Text content */}
          <div className="w-full flex flex-col items-start gap-4 md:gap-8">
            <span className="font-mono font-medium text-sm md:text-base uppercase leading-6 bg-gradient-to-r from-[#80a8ff] to-[#0555ff] bg-clip-text text-transparent">
              {t('modelsTitle')}
            </span>
            <h2 className="font-sans text-left font-semibold text-[28px] md:text-[40px] leading-[32px] md:leading-[48px] text-black dark:text-white whitespace-pre-line">
              {t('modelsHeading')}
            </h2>
            <div className="w-full lg:w-[360px] flex flex-col gap-y-3">
              <div className="flex flex-row gap-x-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div className="flex-1 font-sans text-sm md:text-base font-normal leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                  {t('modelsDesc1')}
                </div>
              </div>
              <div className="flex flex-row gap-x-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div className="flex-1 font-sans text-sm md:text-base font-normal leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                  {t('modelsDesc2')}
                </div>
              </div>
              <div className="flex flex-row gap-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div className="flex-1 font-normal font-sans text-sm md:text-base leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                  {t('modelsDesc3')}
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Model cards */}
          <div className="w-full flex flex-col gap-y-6 md:gap-y-10">
            {/* Top row - Seed and Qwen */}
            <div className="flex flex-col md:flex-row gap-6">
              {/* Model 1 - Seed */}
              <TiltCard
                href={tUrl('/model-common-config#doubao-seed-model')}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[185px] flex items-center justify-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage: 'url(/images/backgrounds/doubao.svg)',
                      }}
                    />
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/doubao-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  </div>
                  <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                    {t('modelSeedName')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('modelSeedDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* Model 2 - Qwen */}
              <TiltCard
                href={tUrl('/model-common-config#qwen')}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[185px] flex items-center justify-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage: 'url(/images/backgrounds/qwen.svg)',
                      }}
                    />
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/qwen-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  </div>
                  <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                    {t('modelQwenName')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('modelQwenDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>

            {/* Bottom row - Gemini and UI-TARS */}
            <div className="flex flex-col md:flex-row gap-6">
              {/* Model 3 - Gemini */}
              <TiltCard
                href={tUrl('/model-common-config#gemini')}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[185px] flex items-center justify-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage: 'url(/images/backgrounds/gemini.svg)',
                      }}
                    />
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gemini-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  </div>
                  <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                    {t('modelGeminiName')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('modelGeminiDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* Model 4 - Multi-model combo */}
              <TiltCard
                href={tUrl(t('multiModelStrategyLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[185px] flex items-center justify-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-light.svg)',
                      }}
                    >
                      <img
                        src="/icon/multi-model.png"
                        alt="Multi-model combo"
                        className="w-[120px] h-[105px]"
                      />
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <img
                        src="/icon/multi-model-dark.png"
                        alt="Multi-model combo"
                        className="w-[150px] h-auto"
                      />
                    </div>
                  </div>
                  <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                    {t('modelMultiModelName')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('modelMultiModelDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>
          </div>
        </FeatureSectionColumns>
      </div>

      {/* Divider */}
      <SectionDivider className="home-feature__divider" />

      {/* Section 3: DEBUGGING */}
      <div className="w-full flex items-center justify-center py-20">
        <FeatureSectionColumns>
          {/* Left side - Text content */}
          <div className="w-full flex flex-col items-start gap-y-4 md:gap-y-8">
            <div className="font-mono font-medium text-sm md:text-base uppercase bg-gradient-to-r from-[#80a8ff] to-[#0555ff] bg-clip-text text-transparent leading-6">
              {t('debuggingTitle')}
            </div>
            <h2 className="font-sans font-semibold text-[28px] md:text-[40px] leading-[32px] md:leading-[48px] text-black dark:text-white">
              {t('debuggingHeading')}
            </h2>
            <div className="w-full lg:w-[360px] flex flex-col gap-y-3">
              <div className="flex flex-row gap-x-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div className="flex-1 font-sans text-sm md:text-base font-normal leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                  {t('debuggingDesc1')}
                </div>
              </div>
              <div className="flex flex-row gap-x-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div className="flex-1 font-sans text-sm md:text-base font-normal leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                  {t('debuggingDesc2')}
                </div>
              </div>
              <div className="flex flex-row gap-x-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div className="flex-1 font-sans text-sm md:text-base font-normal leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                  {t('debuggingDesc3')}
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Feature cards */}
          <div className="w-full flex flex-col gap-y-6 md:gap-y-10">
            {/* Top row */}
            <div className="flex flex-col md:flex-row gap-6">
              {/* Rich APIs Card */}
              <TiltCard
                href={tUrl(t('featureRichAPIsLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[185px] flex justify-center items-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-light.svg)',
                      }}
                    >
                      <img
                        src="/icon/ai-action.svg"
                        alt="Rich APIs"
                        className="w-12 h-12 md:w-16 md:h-16"
                      />
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <img
                        src="/icon/ai-action.svg"
                        alt="Rich APIs"
                        className="w-12 h-12 md:w-16 md:h-16"
                      />
                    </div>
                  </div>
                  <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                    {t('featureRichAPIs')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('featureRichAPIsDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* Skills Card */}
              <TiltCard
                href={tUrl(t('featureSkillsLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[185px] flex justify-center items-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-light.svg)',
                      }}
                    >
                      <img
                        src="/icon/ai-tap.svg"
                        alt="Skills"
                        className="w-12 h-12 md:w-16 md:h-16"
                      />
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <img
                        src="/icon/ai-tap.svg"
                        alt="Skills"
                        className="w-12 h-12 md:w-16 md:h-16"
                      />
                    </div>
                  </div>
                  <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                    {t('featureSkills')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('featureSkillsDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>

            {/* Bottom row */}
            <div className="flex flex-col md:flex-row gap-6">
              {/* Reports & Playground Card */}
              <TiltCard
                href={tUrl(t('featureReportsPlaygroundLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[185px] flex justify-center items-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-light.svg)',
                      }}
                    >
                      <img
                        src="/icon/playback-report.svg"
                        alt="Reports & Playground"
                        className="w-12 h-12 md:w-16 md:h-16"
                      />
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <img
                        src="/icon/playback-report.svg"
                        alt="Reports & Playground"
                        className="w-12 h-12 md:w-16 md:h-16"
                      />
                    </div>
                  </div>
                  <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                    {t('featureReportsPlayground')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('featureReportsPlaygroundDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* Flexible Integration Card */}
              <TiltCard
                href={tUrl(t('featureFlexibleIntegrationLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col group cursor-pointer"
              >
                <div className="flex flex-col gap-[17px] h-full">
                  <div className="rounded-2xl w-full h-[120px] md:h-[185px] flex justify-center items-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-light.svg)',
                      }}
                    >
                      <img
                        src="/icon/ai-query.svg"
                        alt="Flexible Integration"
                        className="w-12 h-12 md:w-16 md:h-16"
                      />
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full items-center justify-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <img
                        src="/icon/ai-query.svg"
                        alt="Flexible Integration"
                        className="w-12 h-12 md:w-16 md:h-16"
                      />
                    </div>
                  </div>
                  <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                    {t('featureFlexibleIntegration')}
                  </p>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('featureFlexibleIntegrationDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>

            {/* View all APIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* View All APIs Link Card */}
              <div className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-y-4 md:gap-y-6">
                <div className="font-sans font-medium text-xl md:text-2xl leading-6 text-transparent">
                  {/* Empty placeholder to align with other cards */}.
                </div>
                <div className="flex flex-col gap-[17px]">
                  <TiltCard
                    href={tUrl('/api')}
                    className="rounded-2xl w-full h-[120px] md:h-[185px] flex flex-col justify-center items-center hover:bg-gray-200 dark:hover:bg-[#252525] transition-all duration-200 cursor-pointer group border-2 border-transparent hover:border-[#0555FF] overflow-hidden"
                  >
                    <div
                      className="dark:hidden w-full h-full flex flex-col justify-center items-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-light.svg)',
                      }}
                    >
                      <div className="flex items-center gap-2 font-sans font-semibold text-lg text-black dark:text-white mb-2">
                        {t('apiMoreLink')}
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="transition-transform group-hover:translate-x-1"
                          role="img"
                          aria-label="Arrow right"
                        >
                          <title>Arrow right</title>
                          <path
                            d="M7.5 15L12.5 10L7.5 5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div className="font-sans text-sm text-black/60 dark:text-white/60">
                        aiAct, aiLocate, aiAssert...
                      </div>
                    </div>
                    <div
                      className="hidden dark:flex w-full h-full flex-col justify-center items-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-dark.svg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <div className="flex items-center gap-2 font-sans font-semibold text-lg text-black dark:text-white mb-2">
                        {t('apiMoreLink')}
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="transition-transform group-hover:translate-x-1"
                          role="img"
                          aria-label="Arrow right"
                        >
                          <title>Arrow right</title>
                          <path
                            d="M7.5 15L12.5 10L7.5 5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div className="font-sans text-sm text-black/60 dark:text-white/60">
                        aiAct, aiLocate, aiAssert...
                      </div>
                    </div>
                  </TiltCard>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('apiMoreDesc')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FeatureSectionColumns>
      </div>

      {/* Divider */}
      <SectionDivider className="home-feature__divider" />

      {/* Section 4: BENCHMARKS */}
      <div className="w-full flex items-center justify-center py-20">
        <FeatureSectionColumns>
          <div className="w-full flex flex-col items-start gap-y-4 md:gap-y-8">
            <div className="font-mono font-medium text-sm md:text-base uppercase bg-gradient-to-r from-[#80a8ff] to-[#0555ff] bg-clip-text text-transparent leading-6">
              {t('benchmarksTitle')}
            </div>
            <h2 className="font-sans font-semibold text-[28px] md:text-[40px] leading-[32px] md:leading-[48px] text-black dark:text-white">
              {t('benchmarksHeading')}
            </h2>
            <div className="flex flex-row gap-x-3">
              <div className="w-3 pt-1.5">
                <GradientIcon />
              </div>
              <p className="flex-1 font-sans text-sm md:text-base font-normal leading-[22px] md:leading-[26px] text-black/70 dark:text-white/70">
                {t('benchmarksDesc')}
              </p>
            </div>
          </div>

          <div className="w-full flex flex-col md:flex-row gap-6">
            <BenchmarkLinkCard
              href={tUrl(t('featureBenchmarkLink'))}
              score="93.1%"
              title="AndroidWorld Benchmark"
              details={`${t('benchmark')} 93.1% · Pass@3 97.4%`}
            />

            <BenchmarkLinkCard
              href={tUrl(t('featureMobileWorldBenchmarkLink'))}
              score="78.6%"
              title="MobileWorld Benchmark"
              details={`${t('benchmark')} 78.6% · 92/117`}
            />
          </div>
        </FeatureSectionColumns>
      </div>
    </div>
  );
}
