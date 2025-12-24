import { useI18n } from '../i18n';
import { CTAButtons } from './CTAButtons';

export function Banner() {
  const t = useI18n();

  return (
    <div className="flex justify-center items-center w-full min-h-[400px] md:min-h-[664px] bg-transparent">
      <div className="w-full max-w-[1440px] px-5 md:px-10 py-10 md:py-20 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
        <div className="flex flex-col items-start">
          {/* New Badge */}
          <div className="backdrop-blur-[48px] rounded-[37px] flex flex-row items-center pl-[5px] pr-3 md:pr-4 py-1.5 gap-x-2 dark:bg-[rgba(255,255,255,0.08)] border border-[rgba(17,17,19,0.12)]">
            <div className="w-8 md:w-10 h-[22px] flex items-center justify-center rounded-full bg-[#0555FF]">
              <span className="text-white text-[10px] md:text-xs font-medium font-sans">
                New
              </span>
            </div>
            <div className="flex items-center justify-center">
              <span className="font-sans font-medium text-[10px] md:text-xs text-black/85 dark:text-white/85">
                {t('newBadge')}
                <span className="mx-1 text-black/40 dark:text-white/40">|</span>
                <a
                  className="text-black/60 hover:underline dark:text-white/60"
                  href="/changelog"
                >
                  {t('changelogLink')}
                </a>
              </span>
            </div>
          </div>

          {/* Title Section */}
          <div className="mt-8 md:mt-12 flex flex-col items-start gap-y-4 md:gap-y-8">
            <h1 className="font-sans font-extrabold text-[32px] md:text-[80px] tracking-[0.64px] md:tracking-[1.6px] leading-[32px] md:leading-[72px] text-black/90 dark:text-white/90">
              {t('heroTitle')}
            </h1>
            <p className="font-sans text-sm md:text-lg leading-[16px] md:leading-[18px] tracking-[-0.28px] md:tracking-[-0.36px] text-black/70 dark:text-white/70">
              {t('heroSubtitle')}
            </p>
          </div>

          {/* Stats Section */}
          <div className="mt-8 md:mt-12 flex flex-row gap-x-8 md:gap-x-16">
            <div className="flex flex-col gap-1 md:gap-1.5">
              <div className="font-sans text-[28px] md:text-[40px] font-semibold leading-[32px] md:leading-[48px] tracking-[-1px] md:tracking-[-1.6px] text-black dark:text-white">
                11k+
              </div>
              <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 text-black/50 dark:text-white/50">
                {t('githubStars')}
              </div>
            </div>

            <div className="flex flex-col gap-1 md:gap-1.5">
              <div className="font-sans text-[28px] md:text-[40px] font-semibold tracking-[-1px] md:tracking-[-1.6px] leading-[32px] md:leading-[48px] text-black dark:text-white">
                #2
              </div>
              <div className="font-sans text-sm md:text-base font-normal leading-5 md:leading-6 whitespace-nowrap text-black/50 dark:text-white/50">
                {t('activeUsers')}
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="mt-8 md:mt-12">
            <CTAButtons />
          </div>
        </div>

        {/* Right Image */}
        <div className="w-[786px] flex justify-center lg:justify-end">
          <div className="relative w-full max-w-[780px] rounded-[28px] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-[#e7ecf5] dark:border-[#2f323a] overflow-hidden">
            <div
              className="dark:hidden w-full h-full flex items-center justify-center"
              style={{
                backgroundImage: 'url(/images/backgrounds/gradient-light.svg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <img
                src="/banner-light.png"
                alt="Midscene banner"
                className="w-full h-auto rounded-[20px] border border-black/5"
                loading="lazy"
              />
            </div>
            <div
              className="hidden dark:flex w-full h-full items-center justify-center"
              style={{
                backgroundImage: 'url(/images/backgrounds/gradient-dark.svg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <img
                src="/banner-dark.png"
                alt="Midscene banner"
                className="w-full h-auto rounded-[20px] border border-white/10"
                loading="lazy"
              />
            </div>
            <div className="absolute -bottom-6 left-6 h-12 w-12 rounded-full bg-white/80 dark:bg-white/5 backdrop-blur border border-black/5 dark:border-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
