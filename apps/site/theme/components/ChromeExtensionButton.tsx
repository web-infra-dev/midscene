const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/midscene/gbldofcpkknbggpkmbdaefngejllnief';

interface ChromeExtensionButtonProps {
  linkLabel: string;
}

export function ChromeExtensionButton({
  linkLabel,
}: ChromeExtensionButtonProps) {
  return (
    <div className="my-3">
      <a
        href={CHROME_WEB_STORE_URL}
        target="_blank"
        rel="noreferrer"
        aria-label={linkLabel}
        className="inline-flex cursor-pointer rounded-lg border border-black/15 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0555FF]/50 hover:shadow-md active:translate-y-0 active:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0555FF] dark:border-white/20 dark:bg-white"
      >
        <img
          src="/images/chrome-web-store-badge.png"
          alt="Available in the Chrome Web Store"
          width="496"
          height="150"
          className="no-zoom m-0 block h-auto w-[200px]"
        />
      </a>
    </div>
  );
}
