import { assetUrls } from '../../assets';

export default function MainContent() {
  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-l-[12px] border-r border-[#ECECEC] bg-white">
      <div className="flex h-[52px] items-center pl-[8px] pr-4">
        <div className="flex items-center">
          <div className="ml-[8px] flex h-6 w-6 items-center justify-center rounded-[3.6px] bg-white">
            <img alt="" className="h-[21.6px]" src={assetUrls.main.device} />
          </div>
          <span className="ml-[8px] w-[134px] overflow-hidden whitespace-nowrap text-[13px] leading-[22.1px] font-medium text-[#0D0D0D]">
            三星 Galaxy S26 Ultra
          </span>
          <div className="ml-[8px] flex h-[28px] items-center gap-[8.04px] rounded-[16.07px] bg-[#E5FFF4] px-[10px]">
            <div className="h-2 w-2 rounded-full border-2 border-[#ADECD0] bg-[#12B981]" />
            <span className="text-[12.1px] leading-[12.1px] font-medium text-[#079669]">
              Live
            </span>
          </div>
        </div>

        <div className="flex flex-1 justify-end gap-[8.04px]">
          <button
            className="flex h-8 items-center rounded-lg border border-[#ECECEC] px-3"
            type="button"
          >
            <img
              alt=""
              className="mr-[5px] h-3.5 w-3.5"
              src={assetUrls.main.disconnect}
            />
            <span className="whitespace-nowrap px-[3px] text-[13px] leading-[20px] font-medium text-black/90">
              Disconnect
            </span>
          </button>
          <button
            className="flex h-8 items-center gap-[4.02px] rounded-lg border border-[#ECECEC] bg-[#F0F2F5] px-3"
            type="button"
          >
            <div className="flex h-4 w-4 items-center">
              <img alt="" className="h-4 w-4" src={assetUrls.main.chat} />
            </div>
            <span className="overflow-hidden whitespace-nowrap text-[13px] leading-[20px] font-medium text-black/90">
              Chat
            </span>
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
        <img
          alt="Phone screen"
          className="absolute left-1/2 top-[111.7px] h-[640.5px] w-[360.4px] -translate-x-1/2"
          src={assetUrls.main.phoneScreen}
        />
      </div>
    </div>
  );
}
