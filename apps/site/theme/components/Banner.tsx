import { Link } from '@rspress/core/theme-original';
import { useI18n } from '../i18n';
import { CTAButtons } from './CTAButtons';

export function Banner() {
  const t = useI18n();

  return (
    <div className="flex justify-center items-center w-full min-h-[400px] md:min-h-[760px] bg-transparent">
      <div className="w-full max-w-[1200px] px-5 lg:px-0 py-10 md:py-20 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
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
                <Link
                  className="text-black/60 hover:underline dark:text-white/60"
                  href="./changelog"
                >
                  {t('changelogLink')}
                </Link>
              </span>
            </div>
          </div>

          {/* Title Section */}
          <div className="mt-8 md:mt-12 flex flex-col items-start gap-y-4 md:gap-y-8">
            <h1 className="font-sans font-extrabold text-[32px] md:text-[64px] tracking-[0.64px] md:tracking-[1.6px] leading-[32px] md:leading-[72px] text-black/90 dark:text-white/90">
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
        <div className="w-full lg:w-[786px] flex justify-center lg:justify-end">
          <div className="dark:hidden w-full h-full flex items-center justify-center">
            <video
              src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene-banner-light.mp4"
              poster="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene-banner-light.png"
              className="w-full max-w-[780px]"
              autoPlay
              muted
              loop
              playsInline
              controls={false}
              preload="auto"
            />
          </div>
          <div className="hidden dark:flex w-full h-full items-center justify-center">
            <video
              src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene-banner-dark.mp4"
              poster="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene-banner-dark.png"
              className="w-full max-w-[780px]"
              autoPlay
              muted
              loop
              playsInline
              controls={false}
              preload="auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
