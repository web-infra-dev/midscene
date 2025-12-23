import { useI18n, useI18nUrl } from '../i18n';
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

export function FeatureSections() {
  const t = useI18n();
  const tUrl = useI18nUrl();

  return (
    <div className="flex flex-col w-full bg-white dark:bg-[#121212]">
      {/* Section 1: CLIENTS */}
      <div className="w-full flex flex-col items-center justify-center py-20">
        <div className="flex flex-col lg:flex-row items-start px-5 md:px-10 gap-8 lg:gap-[278px] max-w-[1440px] mx-auto w-full">
          {/* Left side - Text content */}
          <div className="w-full lg:w-[360px] flex flex-col items-start gap-y-4 md:gap-y-8">
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
            </div>
          </div>

          {/* Right side - Cards */}
          <div className="w-full lg:w-[802px] flex flex-col gap-y-6 md:gap-y-10">
            {/* Top row */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
              {/* Web Card */}
              <TiltCard
                href={tUrl(t('platformWebLink'))}
                className="w-full md:w-[381px] md:h-[368px] flex flex-col gap-y-4 md:gap-y-6 group cursor-pointer"
              >
                <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                  {t('platformWeb')}
                </p>
                <div className="flex flex-col gap-[17px]">
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
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformWebDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* iOS Card */}
              <TiltCard
                href={tUrl(t('platformIOSLink'))}
                className="w-full md:w-[381px] md:h-[368px] flex flex-col gap-4 md:gap-6 group cursor-pointer"
              >
                <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                  {t('platformIOS')}
                </p>
                <div className="flex flex-col gap-[17px]">
                  <div className="rounded-2xl w-full h-[120px] md:h-[264px] flex justify-center items-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/gradient-light.svg)',
                      }}
                    >
                      <img
                        src="/images/platforms/ios-light.png"
                        alt="iOS"
                        className="w-[90px] h-[186px]"
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
                        src="/images/platforms/ios-dark.png"
                        alt="iOS"
                        className="w-[90px] h-[186px]"
                      />
                    </div>
                  </div>
                  <div className="text-sm md:text-base font-normal font-sans leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformIOSDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>

            {/* Bottom row */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
              {/* Android Card */}
              <TiltCard
                href={tUrl(t('platformAndroidLink'))}
                className="w-full md:w-[381px] md:h-[368px] flex flex-col gap-y-4 md:gap-y-6 group cursor-pointer"
              >
                <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                  {t('platformAndroid')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
                  <div className="rounded-2xl w-full h-[120px] md:h-[264px] flex justify-center items-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
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
                        src="/images/platforms/android-dark.png"
                        alt="Android"
                        className="w-[90px] h-[186px]"
                      />
                    </div>
                  </div>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformAndroidDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* Any Interface Card */}
              <TiltCard
                href={tUrl(t('platformAnyInterfaceLink'))}
                className="w-full md:w-[381px] md:h-[368px] flex flex-col gap-y-4 md:gap-y-6 group cursor-pointer"
              >
                <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                  {t('platformAnyInterface')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
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
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformAnyInterfaceDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full flex justify-center">
        <div
          className="h-px bg-black/[0.08] dark:bg-white/[0.08]"
          style={{ width: '1360px' }}
        />
      </div>

      {/* Section 2: MODELS */}
      <div className="w-full flex items-center justify-center py-20">
        <div className="flex flex-col lg:flex-row px-5 md:px-10 gap-8 lg:gap-x-[278px] max-w-[1440px] mx-auto w-full">
          {/* Left side - Text content */}
          <div className="w-full lg:w-[360px] flex flex-col items-start gap-4 md:gap-8">
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
          <div className="w-full lg:w-[802px] flex flex-col gap-y-6 md:gap-y-10">
            {/* Top row - Seed and Qwen */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
              {/* Model 1 - Seed */}
              <TiltCard
                href={tUrl('/model-config#doubao-seed-vision')}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-4 md:gap-6 group cursor-pointer"
              >
                <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                  {t('modelSeedName')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
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
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('modelSeedDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* Model 2 - Qwen */}
              <TiltCard
                href={tUrl('/model-config#qwen3-vl')}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-4 md:gap-6 group cursor-pointer"
              >
                <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                  {t('modelQwenName')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
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
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('modelQwenDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>

            {/* Bottom row - Gemini and UI-TARS */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
              {/* Model 3 - Gemini */}
              <TiltCard
                href={tUrl('/model-config#gemini-3-pro')}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-4 md:gap-6 group cursor-pointer"
              >
                <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                  {t('modelGeminiName')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
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
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('modelGeminiDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* Model 4 - Multi-model combo */}
              <TiltCard
                href={tUrl(t('multiModelStrategyLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-4 md:gap-6 group cursor-pointer"
              >
                <span className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                  {t('modelMultiModelName')}
                </span>
                <div className="flex flex-col gap-y-[17px]">
                  <div className="rounded-2xl w-full h-[120px] md:h-[185px] flex items-center justify-center group-hover:bg-gray-200 dark:group-hover:bg-[#252525] transition-all duration-200 border-2 border-transparent group-hover:border-[#0555FF] overflow-hidden">
                    <div
                      className="dark:hidden w-full h-full flex items-center justify-center bg-cover bg-center rounded-2xl"
                      style={{
                        backgroundImage:
                          'url(/images/backgrounds/grid-light.svg)',
                      }}
                    >
                      <img
                        src="/icon/multi-model.svg"
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
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('modelMultiModelDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full flex justify-center">
        <div
          className="h-px bg-black/[0.08] dark:bg-white/[0.08]"
          style={{ width: '1360px' }}
        />
      </div>

      {/* Section 3: DEBUGGING */}
      <div className="w-full flex items-center justify-center py-20">
        <div className="flex flex-col lg:flex-row px-5 md:px-10 gap-8 lg:gap-x-[278px] max-w-[1440px] mx-auto w-full">
          {/* Left side - Text content */}
          <div className="w-full lg:w-[360px] flex flex-col items-start gap-y-4 md:gap-y-8">
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
          <div className="w-full lg:w-[802px] flex flex-col gap-y-6 md:gap-y-10">
            {/* Top row */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
              {/* Rich APIs Card */}
              <TiltCard
                href={tUrl(t('featureRichAPIsLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-4 md:gap-6 group cursor-pointer"
              >
                <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                  {t('featureRichAPIs')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
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
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('featureRichAPIsDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* MCP Server Card */}
              <TiltCard
                href={tUrl(t('featureMCPServerLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-4 md:gap-6 group cursor-pointer"
              >
                <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                  {t('featureMCPServer')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
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
                        alt="MCP Server"
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
                        alt="MCP Server"
                        className="w-12 h-12 md:w-16 md:h-16"
                      />
                    </div>
                  </div>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('featureMCPServerDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>

            {/* Bottom row */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
              {/* Reports & Playground Card */}
              <TiltCard
                href={tUrl(t('featureReportsPlaygroundLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-4 md:gap-6 group cursor-pointer"
              >
                <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                  {t('featureReportsPlayground')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
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
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('featureReportsPlaygroundDesc')}
                  </div>
                </div>
              </TiltCard>

              {/* Flexible Integration Card */}
              <TiltCard
                href={tUrl(t('featureFlexibleIntegrationLink'))}
                className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-4 md:gap-6 group cursor-pointer"
              >
                <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                  {t('featureFlexibleIntegration')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
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
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('featureFlexibleIntegrationDesc')}
                  </div>
                </div>
              </TiltCard>
            </div>

            {/* View All APIs row */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
              {/* View All APIs Link Card */}
              <div className="w-full md:w-[381px] md:h-[289px] flex flex-col gap-y-4 md:gap-y-6">
                <div className="font-sans font-medium text-xl md:text-2xl leading-6 text-transparent">
                  {/* Empty placeholder to align with other cards */}.
                </div>
                <div className="flex flex-col gap-[17px]">
                  <TiltCard
                    href="/zh/api"
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
        </div>
      </div>
    </div>
  );
}
