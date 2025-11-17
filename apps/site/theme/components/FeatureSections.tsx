import { useDark } from '@rspress/core/runtime';
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
  const dark = useDark();
  const t = useI18n();

  return (
    <div
      className={`flex flex-col w-full ${dark ? 'bg-[#121212]' : 'bg-white'}`}
    >
      {/* Section 1: CLIENTS */}
      <div className="w-full flex flex-col">
        <div className="flex flex-row items-start mt-[120px] px-10 gap-[278px] max-w-[1440px] mx-auto w-full">
          {/* Left side - Text content */}
          <div className="w-[275px] flex flex-col items-start gap-y-8">
            <div className="font-mono font-medium text-base leading-6 bg-gradient-to-r from-[#80A8FF] to-[#0555FF] bg-clip-text text-transparent">
              {t('clientsTitle')}
            </div>
            <div
              className={`w-[275px] flex items-center font-sans font-semibold text-[40px] leading-[48px] ${dark ? 'text-white' : 'text-black'}`}
            >
              {t('clientsHeading')}
            </div>
            <div className="w-[275px] flex flex-col gap-y-3">
              <div className="flex flex-row gap-x-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div
                  className={`flex-1 font-sans text-base font-normal leading-[26px] ${dark ? 'text-white/70' : 'text-black/70'}`}
                >
                  {t('clientsDesc1')}
                </div>
              </div>
              <div className="flex flex-row gap-3">
                <div className="w-3 pt-1.5">
                  <GradientIcon />
                </div>
                <div
                  className={`flex-1 font-sans text-base font-normal leading-[26px] ${dark ? 'text-white/70' : 'text-black/70'}`}
                >
                  {t('clientsDesc2')}
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Cards */}
          <div className="w-[807px] flex flex-col gap-y-10">
            {/* Top row */}
            <div className="flex flex-row gap-x-10">
              {/* Web Card */}
              <div className="w-[383px] flex flex-col gap-y-6">
                <p
                  className={`font-sans font-medium text-2xl leading-6 ${dark ? 'text-white' : 'text-black'}`}
                >
                  {t('platformWeb')}
                </p>
                <div className="flex flex-col gap-[17px]">
                  <div
                    className={`rounded-2xl w-full h-[160px] flex items-center justify-center ${dark ? 'bg-[#1C1C1C]' : 'bg-gray-100'}`}
                  >
                    <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-[#0555FF] shadow-[0_4px_4px_rgba(0,0,0,0.05)]">
                      <AppWindow className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div
                    className={`font-sans text-base font-normal leading-6 ${dark ? 'text-white/70' : 'text-black/70'}`}
                  >
                    {t('platformWebDesc')}
                  </div>
                </div>
              </div>

              {/* iOS Card */}
              <div className="w-[383px] flex flex-col gap-6">
                <p
                  className={`font-sans text-2xl font-medium leading-6 ${dark ? 'text-white' : 'text-black'}`}
                >
                  {t('platformIOS')}
                </p>
                <div className="flex flex-col gap-[17px]">
                  <div
                    className={`rounded-2xl w-full h-[160px] flex justify-center items-center ${dark ? 'bg-[#1C1C1C]' : 'bg-gray-100'}`}
                  >
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0px_4px_4px_rgba(0,0,0,0.05)] ${dark ? 'bg-black' : 'bg-gray-800'}`}
                    >
                      <Apple className="text-white w-8 h-8" />
                    </div>
                  </div>
                  <div
                    className={`text-base font-normal font-sans leading-6 ${dark ? 'text-white/70' : 'text-black/70'}`}
                  >
                    {t('platformIOSDesc')}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row */}
            <div className="flex flex-row gap-x-10">
              {/* Android Card */}
              <div className="w-[383px] flex flex-col gap-y-6">
                <p
                  className={`font-sans font-medium text-2xl leading-6 ${dark ? 'text-white' : 'text-black'}`}
                >
                  {t('platformAndroid')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
                  <div
                    className={`rounded-2xl w-full h-[160px] flex justify-center items-center ${dark ? 'bg-[#1C1C1C]' : 'bg-gray-100'}`}
                  >
                    <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-[#1FA679] shadow-[0_4px_4px_rgba(0,0,0,0.05)]">
                      <Bot className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <div
                    className={`font-sans text-base font-normal leading-6 ${dark ? 'text-white/70' : 'text-black/70'}`}
                  >
                    {t('platformAndroidDesc')}
                  </div>
                </div>
              </div>

              {/* Any Interface Card */}
              <div className="w-[383px] flex flex-col gap-y-6">
                <p
                  className={`font-sans font-medium text-2xl leading-6 ${dark ? 'text-white' : 'text-black'}`}
                >
                  {t('platformAnyInterface')}
                </p>
                <div className="flex flex-col gap-y-[17px]">
                  <div
                    className={`rounded-2xl w-full h-[160px] flex justify-center items-center ${dark ? 'bg-[#1C1C1C]' : 'bg-gray-100'}`}
                  >
                    <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-[#FA884B] shadow-[0_4px_4px_rgba(0,0,0,0.05)]">
                      <Grid2x2 className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <div
                    className={`font-sans text-base font-normal leading-6 ${dark ? 'text-white/70' : 'text-black/70'}`}
                  >
                    {t('platformAnyInterfaceDesc')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: MODELS */}
      <div className="w-full flex flex-row px-10 pt-[120px] pb-[120px] gap-x-[278px] max-w-[1440px] mx-auto">
        {/* Left side - Text content */}
        <div className="w-[275px] flex flex-col items-start gap-8">
          <span className="font-mono font-medium text-base uppercase leading-6 bg-gradient-to-r from-[#80a8ff] to-[#0555ff] bg-clip-text text-transparent">
            {t('modelsTitle')}
          </span>
          <div
            className={`w-[275px] font-sans text-left font-semibold text-[40px] leading-[48px] ${dark ? 'text-white' : 'text-black'}`}
          >
            {t('modelsHeading')}
          </div>
          <div className="w-[275px] flex flex-col gap-y-3">
            <div className="flex flex-row gap-x-3">
              <div className="w-3 pt-1.5">
                <GradientIcon />
              </div>
              <div
                className={`flex-1 font-sans text-base font-normal leading-[26px] ${dark ? 'text-white/70' : 'text-black/70'}`}
              >
                {t('modelsDesc1')}
              </div>
            </div>
            <div className="flex flex-row gap-x-3">
              <div className="w-3 pt-1.5">
                <GradientIcon />
              </div>
              <div
                className={`flex-1 font-sans text-base font-normal leading-[26px] ${dark ? 'text-white/70' : 'text-black/70'}`}
              >
                {t('modelsDesc2')}
              </div>
            </div>
            <div className="flex flex-row gap-3">
              <div className="w-3 pt-1.5">
                <GradientIcon />
              </div>
              <div
                className={`flex-1 font-normal font-sans text-base leading-[26px] ${dark ? 'text-white/70' : 'text-black/70'}`}
              >
                {t('modelsDesc3')}
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Model cards */}
        <div className="w-[807px] flex flex-row gap-x-10">
          {/* Model 1 */}
          <div className="w-[383px] flex flex-col gap-6">
            <p
              className={`font-sans text-2xl font-medium leading-6 ${dark ? 'text-white' : 'text-black'}`}
            >
              {t('modelName')}
            </p>
            <div className="flex flex-col gap-y-[17px]">
              <div className="bg-[#07112B] rounded-2xl shadow-[0_4px_4px_0_rgba(0,0,0,0.05)] w-full h-[160px] flex items-center justify-center">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-[0_4px_4px_rgba(0,0,0,0.05)]" />
              </div>
              <div
                className={`font-sans text-base font-normal leading-6 ${dark ? 'text-white/70' : 'text-black/70'}`}
              >
                {t('modelDesc')}
              </div>
            </div>
          </div>

          {/* Model 2 */}
          <div className="w-[383px] flex flex-col gap-6">
            <span
              className={`font-sans font-medium text-2xl leading-6 ${dark ? 'text-white' : 'text-black'}`}
            >
              {t('modelName')}
            </span>
            <div className="flex flex-col gap-y-[17px]">
              <div className="bg-[#1D1D46] rounded-2xl w-full h-[160px] flex items-center justify-center">
                <div className="w-16 h-16 rounded-2xl overflow-hidden">
                  <img
                    src="https://placehold.co/64x64.png"
                    alt="Model"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div
                className={`font-sans text-base font-normal leading-6 ${dark ? 'text-white/70' : 'text-black/70'}`}
              >
                {t('modelDesc')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: DEBUGGING */}
      <div className="w-full flex flex-row pt-[120px] px-10 gap-x-[278px] pb-20 max-w-[1440px] mx-auto">
        {/* Left side - Text content */}
        <div className="w-[275px] flex flex-col items-start gap-y-8">
          <div className="font-mono font-medium text-base uppercase bg-gradient-to-r from-[#80a8ff] to-[#0555ff] bg-clip-text text-transparent leading-6">
            {t('debuggingTitle')}
          </div>
          <div
            className={`w-[275px] flex items-center font-sans font-semibold text-[40px] leading-[48px] ${dark ? 'text-white' : 'text-black'}`}
          >
            {t('debuggingHeading')}
          </div>
          <div className="w-[275px] flex flex-col gap-y-3">
            <div className="flex flex-row gap-x-3">
              <div className="w-3 pt-1.5">
                <GradientIcon />
              </div>
              <div
                className={`flex-1 font-sans text-base font-normal leading-[26px] ${dark ? 'text-white/70' : 'text-black/70'}`}
              >
                {t('debuggingDesc1')}
              </div>
            </div>
            <div className="flex flex-row gap-x-3">
              <div className="w-3 pt-1.5">
                <GradientIcon />
              </div>
              <div
                className={`flex-1 font-sans text-base font-normal leading-[26px] ${dark ? 'text-white/70' : 'text-black/70'}`}
              >
                {t('debuggingDesc2')}
              </div>
            </div>
            <div className="flex flex-row gap-x-3">
              <div className="w-3 pt-1.5">
                <GradientIcon />
              </div>
              <div
                className={`flex-1 font-sans text-base font-normal leading-[26px] ${dark ? 'text-white/70' : 'text-black/70'}`}
              >
                {t('debuggingDesc3')}
              </div>
            </div>
          </div>
        </div>

        {/* Right side - API cards */}
        <div className="w-[807px] flex flex-col gap-y-10">
          {/* Top row */}
          <div className="flex flex-row gap-x-10">
            {/* aiAction Card */}
            <div className="w-[383px] flex flex-col gap-6">
              <p
                className={`font-sans font-medium text-2xl leading-6 ${dark ? 'text-white' : 'text-black'}`}
              >
                {t('apiAction')}
              </p>
              <div className="flex flex-col gap-y-[17px]">
                <div
                  className={`rounded-2xl w-full h-[160px] flex justify-center items-center ${dark ? 'bg-[#1C1C1C]' : 'bg-gray-100'}`}
                >
                  <div
                    className={`w-16 h-16 rounded-2xl shadow-[0_4px_4px_rgba(0,0,0,0.05)] ${dark ? 'bg-[#313131]' : 'bg-gray-300'}`}
                  />
                </div>
                <div
                  className={`font-sans text-base font-normal leading-6 ${dark ? 'text-white/70' : 'text-black/70'}`}
                >
                  {t('apiActionDesc')}
                </div>
              </div>
            </div>

            {/* aiTap Card */}
            <div className="w-[383px] flex flex-col gap-6">
              <p
                className={`font-sans text-2xl font-medium leading-6 ${dark ? 'text-white' : 'text-black'}`}
              >
                {t('apiTap')}
              </p>
              <div className="flex flex-col gap-y-[17px]">
                <div
                  className={`rounded-2xl w-full h-[160px] flex justify-center items-center ${dark ? 'bg-[#1c1c1c]' : 'bg-gray-100'}`}
                >
                  <div
                    className={`w-16 h-16 rounded-2xl shadow-[0_4px_4px_0_rgba(0,0,0,0.05)] ${dark ? 'bg-[#313131]' : 'bg-gray-300'}`}
                  />
                </div>
                <div
                  className={`font-sans text-base font-normal leading-6 ${dark ? 'text-white/70' : 'text-black/70'}`}
                >
                  {t('apiTapDesc')}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div className="w-[383px] flex flex-col gap-y-6">
            <div
              className={`font-sans font-medium text-2xl leading-6 ${dark ? 'text-white' : 'text-black'}`}
            >
              {t('apiPlayback')}
            </div>
            <div className="flex flex-col gap-[17px]">
              <div
                className={`rounded-2xl w-full h-[160px] flex justify-center items-center ${dark ? 'bg-[#1C1C1C]' : 'bg-gray-100'}`}
              >
                <div
                  className={`w-16 h-16 rounded-2xl shadow-[0_4px_4px_0_rgba(0,0,0,0.05)] ${dark ? 'bg-[#313131]' : 'bg-gray-300'}`}
                />
              </div>
              <div
                className={`font-sans text-base font-normal leading-6 ${dark ? 'text-white/70' : 'text-black/70'}`}
              >
                {t('apiPlaybackDesc')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
