import { Link } from '@rspress/core/theme-original';
import { useI18n, useI18nUrl } from '../i18n';

export function CTAButtons() {
  const t = useI18n();
  const tUrl = useI18nUrl();

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-start gap-3 md:gap-x-5 w-full md:w-auto">
      <Link
        href={tUrl('/introduction')}
        className="w-full md:w-auto h-12 px-6 flex items-center justify-center rounded-full bg-[#0555FF] hover:bg-[#0444DD] transition-colors"
      >
        <span className="text-sm font-semibold font-sans text-[#FAFAFA] whitespace-nowrap">
          {t('introduction')}
        </span>
      </Link>
      <Link
        href={tUrl('/showcases')}
        className="w-full md:w-auto h-12 px-6 flex items-center justify-center rounded-full transition-colors bg-[#E5E5E5] hover:bg-[#D4D4D4] dark:bg-[#292929] dark:hover:bg-[#333333]"
      >
        <span className="font-semibold font-sans text-sm whitespace-nowrap text-black dark:text-white">
          {t('whatsNew')}
        </span>
      </Link>
    </div>
  );
}
