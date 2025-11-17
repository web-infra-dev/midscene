import { useDark } from '@rspress/core/runtime';
import { useI18n, useI18nUrl } from '../i18n';

export function Banner() {
  const dark = useDark();
  const t = useI18n();
  const tUrl = useI18nUrl();

  return (
    <div
      className={`flex justify-center items-center w-full min-h-[664px] ${
        dark ? 'bg-[#121212]' : 'bg-white'
      }`}
    >
      <div className="w-full max-w-[1440px] px-10 py-20 flex flex-col items-start">
        {/* New Badge */}
        <div
          className={`backdrop-blur-[48px] rounded-[37px] flex flex-row items-center pl-[5px] pr-4 py-1.5 gap-x-2 ${
            dark
              ? 'bg-[rgba(255,255,255,0.08)] border border-[rgba(17,17,19,0.12)]'
              : 'bg-[rgba(0,0,0,0.05)] border border-[rgba(0,0,0,0.08)]'
          }`}
        >
          <div className="w-10 h-[22px] flex items-center justify-center rounded-full bg-[#0555FF]">
            <span className="text-white text-xs font-medium font-sans">
              New
            </span>
          </div>
          <div className="flex items-center justify-center">
            <span
              className={`font-sans font-medium text-xs ${
                dark ? 'text-white/85' : 'text-black/85'
              }`}
            >
              {t('newBadge')}
            </span>
          </div>
        </div>

        {/* Title Section */}
        <div className="mt-12 flex flex-col items-start gap-y-8">
          <h1
            className={`font-sans font-extrabold uppercase text-[80px] tracking-[1.6px] leading-[72px] ${
              dark ? 'text-white/90' : 'text-black/90'
            }`}
          >
            {t('heroTitle')}
          </h1>
          <p
            className={`font-sans text-lg leading-[18px] tracking-[-0.36px] ${
              dark ? 'text-white/70' : 'text-black/70'
            }`}
          >
            {t('heroSubtitle')}
          </p>
        </div>

        {/* Stats Section */}
        <div className="mt-12 flex flex-row gap-x-16">
          <div className="flex flex-col gap-1.5">
            <div
              className={`font-sans text-[40px] font-semibold leading-[48px] tracking-[-1.6px] ${
                dark ? 'text-white' : 'text-black'
              }`}
            >
              10k+
            </div>
            <div
              className={`font-sans text-base font-normal leading-6 ${
                dark ? 'text-white/50' : 'text-black/50'
              }`}
            >
              {t('githubStars')}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div
              className={`font-sans text-[40px] font-semibold tracking-[-1.6px] leading-[48px] ${
                dark ? 'text-white' : 'text-black'
              }`}
            >
              3k+
            </div>
            <div
              className={`font-sans text-base font-normal leading-6 whitespace-nowrap ${
                dark ? 'text-white/50' : 'text-black/50'
              }`}
            >
              {t('activeUsers')}
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-row items-start gap-x-5 mt-12">
          <a
            href={tUrl('/introduction')}
            className="w-[140px] h-12 flex items-center justify-center rounded-full bg-[#0555FF] hover:bg-[#0444DD] transition-colors"
          >
            <span className="text-sm font-semibold font-sans text-[#FAFAFA]">
              {t('introduction')}
            </span>
          </a>
          <a
            href={tUrl('/quick-experience')}
            className={`w-[140px] h-12 flex items-center justify-center rounded-full transition-colors ${
              dark
                ? 'bg-[#292929] hover:bg-[#333333]'
                : 'bg-[#E5E5E5] hover:bg-[#D4D4D4]'
            }`}
          >
            <span
              className={`font-semibold font-sans text-sm ${
                dark ? 'text-white' : 'text-black'
              }`}
            >
              {t('quickStart')}
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
