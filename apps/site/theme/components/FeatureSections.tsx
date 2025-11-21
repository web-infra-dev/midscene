import { AppWindow, Apple, Bot, Grid2x2 } from 'lucide-react';
import { useI18n } from '../i18n';

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

  return (
    <div className="flex flex-col w-full bg-white dark:bg-[#121212]">
      {/* Section 1: CLIENTS */}
      <div className="w-full flex flex-col">
        <div className="flex flex-col lg:flex-row items-start mt-12 md:mt-20 lg:mt-[120px] px-5 md:px-10 gap-8 lg:gap-[278px] max-w-[1440px] mx-auto w-full">
          {/* Left side - Text content */}
          <div className="w-full lg:w-[275px] flex flex-col items-start gap-y-4 md:gap-y-8">
            <div className="font-mono font-medium text-sm md:text-base leading-6 bg-gradient-to-r from-[#80A8FF] to-[#0555FF] bg-clip-text text-transparent">
              {t('clientsTitle')}
            </div>
            <div className="w-full lg:w-[275px] flex items-center font-sans font-semibold text-[28px] md:text-[40px] leading-[32px] md:leading-[48px] text-black dark:text-white">
              {t('clientsHeading')}
            </div>
            <div className="w-full lg:w-[275px] flex flex-col gap-y-3">
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
          <div className="w-full lg:w-[807px] flex flex-col gap-y-6 md:gap-y-10">
            {/* Top row */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
              {/* Web Card */}
              <div className="w-full md:w-[383px] flex flex-col gap-y-4 md:gap-y-6">
                <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                  {t('platformWeb')}
                </p>
                <div className="flex flex-col gap-[17px]">
                  <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex items-center justify-center bg-gray-100 dark:bg-[#1C1C1C]">
                    <div className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-2xl bg-[#0555FF] shadow-[0_4px_4px_rgba(0,0,0,0.05)]">
                      <AppWindow className="h-6 w-6 md:h-8 md:w-8 text-white" />
                    </div>
                  </div>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformWebDesc')}
                  </div>
                </div>
              </div>

              {/* iOS Card */}
              <div className="w-full md:w-[383px] flex flex-col gap-4 md:gap-6">
                <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                  {t('platformIOS')}
                </p>
                <div className="flex flex-col gap-[17px]">
                  <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex justify-center items-center bg-gray-100 dark:bg-[#1C1C1C]">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center shadow-[0px_4px_4px_rgba(0,0,0,0.05)] bg-gray-800 dark:bg-black">
                      <Apple className="text-white w-6 h-6 md:w-8 md:h-8" />
                    </div>
                  </div>
                  <div className="text-sm md:text-base font-normal font-sans leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformIOSDesc')}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
              {/* Android Card */}
              <div className="w-full md:w-[383px] flex flex-col gap-y-4 md:gap-y-6">
                <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                  {t('platformAndroid')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
                  <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex justify-center items-center bg-gray-100 dark:bg-[#1C1C1C]">
                    <div className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-2xl bg-[#1FA679] shadow-[0_4px_4px_rgba(0,0,0,0.05)]">
                      <Bot className="w-6 h-6 md:w-8 md:h-8 text-white" />
                    </div>
                  </div>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformAndroidDesc')}
                  </div>
                </div>
              </div>

              {/* Any Interface Card */}
              <div className="w-full md:w-[383px] flex flex-col gap-y-4 md:gap-y-6">
                <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                  {t('platformAnyInterface')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
                  <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex justify-center items-center bg-gray-100 dark:bg-[#1C1C1C]">
                    <div className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-2xl bg-[#FA884B] shadow-[0_4px_4px_rgba(0,0,0,0.05)]">
                      <Grid2x2 className="w-6 h-6 md:w-8 md:h-8 text-white" />
                    </div>
                  </div>
                  <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                    {t('platformAnyInterfaceDesc')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: MODELS */}
      <div className="w-full flex flex-col lg:flex-row px-5 md:px-10 pt-12 md:pt-20 lg:pt-[120px] pb-12 md:pb-20 lg:pb-[120px] gap-8 lg:gap-x-[278px] max-w-[1440px] mx-auto">
        {/* Left side - Text content */}
        <div className="w-full lg:w-[275px] flex flex-col items-start gap-4 md:gap-8">
          <span className="font-mono font-medium text-sm md:text-base uppercase leading-6 bg-gradient-to-r from-[#80a8ff] to-[#0555ff] bg-clip-text text-transparent">
            {t('modelsTitle')}
          </span>
          <div className="w-full lg:w-[275px] font-sans text-left font-semibold text-[28px] md:text-[40px] leading-[32px] md:leading-[48px] text-black dark:text-white">
            {t('modelsHeading')}
          </div>
          <div className="w-full lg:w-[275px] flex flex-col gap-y-3">
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
        <div className="w-full lg:w-[807px] flex flex-col gap-y-6 md:gap-y-10">
          {/* Top row - Seed and Qwen */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
            {/* Model 1 - Seed */}
            <div className="w-full md:w-[383px] flex flex-col gap-4 md:gap-6">
              <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                {t('modelSeedName')}
              </p>
              <div className="flex flex-col gap-y-[17px]">
                <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex items-center justify-center bg-gray-100 dark:bg-[#1C1C1C]">
                  <img
                    src="/icon/doubao-color.svg"
                    alt="Doubao Seed"
                    className="w-12 h-12 md:w-16 md:h-16"
                  />
                </div>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('modelSeedDesc')}
                </div>
              </div>
            </div>

            {/* Model 2 - Qwen */}
            <div className="w-full md:w-[383px] flex flex-col gap-4 md:gap-6">
              <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                {t('modelQwenName')}
              </p>
              <div className="flex flex-col gap-y-[17px]">
                <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex items-center justify-center bg-gray-100 dark:bg-[#1C1C1C]">
                  <img
                    src="/icon/qwen-color.svg"
                    alt="Qwen3-VL"
                    className="w-12 h-12 md:w-16 md:h-16"
                  />
                </div>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('modelQwenDesc')}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom row - Gemini and UI-TARS */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
            {/* Model 3 - Gemini */}
            <div className="w-full md:w-[383px] flex flex-col gap-4 md:gap-6">
              <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                {t('modelGeminiName')}
              </p>
              <div className="flex flex-col gap-y-[17px]">
                <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex items-center justify-center bg-gray-100 dark:bg-[#1C1C1C]">
                  <img
                    src="/icon/gemini-color.svg"
                    alt="Gemini-2.5-Pro"
                    className="w-12 h-12 md:w-16 md:h-16"
                  />
                </div>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('modelGeminiDesc')}
                </div>
              </div>
            </div>

            {/* Model 4 - UI-TARS */}
            <div className="w-full md:w-[383px] flex flex-col gap-4 md:gap-6">
              <span className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                {t('modelUITARSName')}
              </span>
              <div className="flex flex-col gap-y-[17px]">
                <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex items-center justify-center bg-gray-100 dark:bg-[#1C1C1C]">
                  <img
                    src="/icon/bytedance-color.svg"
                    alt="UI-TARS"
                    className="w-12 h-12 md:w-16 md:h-16"
                  />
                </div>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('modelUITARSDesc')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: DEBUGGING */}
      <div className="w-full flex flex-col lg:flex-row pt-12 md:pt-20 lg:pt-[120px] px-5 md:px-10 gap-8 lg:gap-x-[278px] pb-10 md:pb-20 max-w-[1440px] mx-auto">
        {/* Left side - Text content */}
        <div className="w-full lg:w-[275px] flex flex-col items-start gap-y-4 md:gap-y-8">
          <div className="font-mono font-medium text-sm md:text-base uppercase bg-gradient-to-r from-[#80a8ff] to-[#0555ff] bg-clip-text text-transparent leading-6">
            {t('debuggingTitle')}
          </div>
          <div className="w-full lg:w-[275px] flex items-center font-sans font-semibold text-[28px] md:text-[40px] leading-[32px] md:leading-[48px] text-black dark:text-white">
            {t('debuggingHeading')}
          </div>
          <div className="w-full lg:w-[275px] flex flex-col gap-y-3">
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

        {/* Right side - API cards */}
        <div className="w-full lg:w-[807px] flex flex-col gap-y-6 md:gap-y-10">
          {/* Top row */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
            {/* aiAction Card */}
            <div className="w-full md:w-[383px] flex flex-col gap-4 md:gap-6">
              <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                {t('apiAction')}
              </p>
              <div className="flex flex-col gap-y-[17px]">
                <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex justify-center items-center bg-gray-100 dark:bg-[#1C1C1C]">
                  <img
                    src="/icon/ai-action.svg"
                    alt="aiAction"
                    className="w-12 h-12 md:w-16 md:h-16"
                  />
                </div>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('apiActionDesc')}
                </div>
              </div>
            </div>

            {/* aiTap Card */}
            <div className="w-full md:w-[383px] flex flex-col gap-4 md:gap-6">
              <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                {t('apiTap')}
              </p>
              <div className="flex flex-col gap-y-[17px]">
                <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex justify-center items-center bg-gray-100 dark:bg-[#1c1c1c]">
                  <img
                    src="/icon/ai-tap.svg"
                    alt="aiTap"
                    className="w-12 h-12 md:w-16 md:h-16"
                  />
                </div>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('apiTapDesc')}
                </div>
              </div>
            </div>
          </div>

          {/* Middle row - aiQuery and aiAssert */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
            {/* aiQuery Card */}
            <div className="w-full md:w-[383px] flex flex-col gap-4 md:gap-6">
              <p className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                {t('apiQuery')}
              </p>
              <div className="flex flex-col gap-y-[17px]">
                <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex justify-center items-center bg-gray-100 dark:bg-[#1C1C1C]">
                  <img
                    src="/icon/ai-query.svg"
                    alt="aiQuery"
                    className="w-12 h-12 md:w-16 md:h-16"
                  />
                </div>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('apiQueryDesc')}
                </div>
              </div>
            </div>

            {/* aiAssert Card */}
            <div className="w-full md:w-[383px] flex flex-col gap-4 md:gap-6">
              <p className="font-sans text-xl md:text-2xl font-medium leading-6 text-black dark:text-white">
                {t('apiAssert')}
              </p>
              <div className="flex flex-col gap-y-[17px]">
                <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex justify-center items-center bg-gray-100 dark:bg-[#1c1c1c]">
                  <img
                    src="/icon/ai-assert.svg"
                    alt="aiAssert"
                    className="w-12 h-12 md:w-16 md:h-16"
                  />
                </div>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('apiAssertDesc')}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom row - Playback Report and View All APIs button */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-x-10">
            {/* Playback Report */}
            <div className="w-full md:w-[383px] flex flex-col gap-y-4 md:gap-y-6">
              <div className="font-sans font-medium text-xl md:text-2xl leading-6 text-black dark:text-white">
                {t('apiPlayback')}
              </div>
              <div className="flex flex-col gap-[17px]">
                <div className="rounded-2xl w-full h-[120px] md:h-[160px] flex justify-center items-center bg-gray-100 dark:bg-[#1C1C1C]">
                  <img
                    src="/icon/playback-report.svg"
                    alt="Playback Report"
                    className="w-12 h-12 md:w-16 md:h-16"
                  />
                </div>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('apiPlaybackDesc')}
                </div>
              </div>
            </div>

            {/* View All APIs Link Card */}
            <div className="w-full md:w-[383px] flex flex-col gap-y-4 md:gap-y-6">
              <div className="font-sans font-medium text-xl md:text-2xl leading-6 text-transparent">
                {/* Empty placeholder to align with other cards */}.
              </div>
              <div className="flex flex-col gap-[17px]">
                <a
                  href="/zh/api"
                  className="rounded-2xl w-full h-[120px] md:h-[160px] flex flex-col justify-center items-center bg-gray-100 dark:bg-[#1C1C1C] hover:bg-gray-200 dark:hover:bg-[#252525] transition-all duration-200 cursor-pointer group border-2 border-transparent hover:border-[#0555FF]"
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
                    aiLocate, aiInput, aiScroll...
                  </div>
                </a>
                <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/70 dark:text-white/70">
                  {t('apiMoreDesc')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
