import { incutPlaygroundImportAssets } from '../../assets';

export function IncutImportedMainHeader() {
  return (
    <div className="flex h-[52px] w-full flex-shrink-0 items-center justify-between border-b border-[#f0f0f0] bg-white px-2 pr-4 font-['Inter']">
      <div className="flex items-center">
        <div className="ml-2 flex h-6 w-6 items-center justify-center rounded-sm bg-white">
          <img
            alt="device"
            className="h-[21.6px] rotate-180 object-contain"
            src={incutPlaygroundImportAssets.main.device}
          />
        </div>
        <span className="ml-2 flex h-[23px] w-[134px] items-center overflow-hidden whitespace-nowrap text-[13px] font-medium text-[#0d0d0d]">
          三星 Galaxy S26 Ultra
        </span>
        <div className="ml-2 flex h-[28px] w-[60.1px] items-center gap-2 rounded-[16.1px] border border-[#adebd0] bg-[#e5fff4] px-[10px] py-2">
          <div className="h-2 w-2 flex-shrink-0 rounded-full border-2 border-[#adebd0] bg-[#12b981]" />
          <span className="flex h-[13px] items-center overflow-hidden whitespace-nowrap text-[12.1px] leading-[13px] font-medium text-[#079669]">
            Live
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="ml-px flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[#ececec] px-3">
          <img
            alt="disconnect"
            className="h-3.5 w-3.5 object-contain"
            src={incutPlaygroundImportAssets.main.disconnect}
          />
          <span className="ml-[3px] h-5 w-[71px] overflow-hidden whitespace-nowrap text-[13px] font-medium text-black/90">
            Disconnect
          </span>
        </div>

        <div className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[#ececec] bg-[#f0f2f5] px-3">
          <div className="flex h-4 w-4 items-center">
            <img
              alt="chat"
              className="h-4 w-4 object-contain"
              src={incutPlaygroundImportAssets.main.chat}
            />
          </div>
          <span className="h-5 w-[30px] overflow-hidden whitespace-nowrap text-[13px] font-medium text-black/90">
            Chat
          </span>
        </div>
      </div>
    </div>
  );
}
