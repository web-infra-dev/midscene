import { assetUrls } from '../../assets';

export default function Playground() {
  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col overflow-hidden rounded-r-[12px] bg-white">
      <div className="flex h-[56px] items-center px-[22px]">
        <span className="text-[13px] leading-[22.1px] font-medium text-[#0D0D0D]">
          Playground
        </span>
      </div>

      <div className="relative flex-1">
        <img
          alt="Logo"
          className="absolute left-[175.3px] top-[240px] h-12 w-[51px] object-contain"
          src={assetUrls.playground.midsceneIcon}
        />
        <h2 className="absolute left-[81px] top-[307px] h-[44px] w-[240px] text-center font-['Roboto'] text-[18px] leading-[22px] font-semibold text-black">
          Welcome to <br /> Midscene.js Playground!
        </h2>
        <div className="absolute left-[41px] top-[365px] h-[176px] w-[320px] whitespace-pre-wrap text-[14px] leading-[22px] text-black/70">
          {`This is a panel for experimenting and testing Midscene.js features. 
You can use natural language instructions to operate the web page, such as clicking buttons, filling in forms, querying information, etc. 
Please enter your instructions in the input box below to start experiencing.`}
        </div>
      </div>

      <div className="relative h-[132px] w-full box-border rounded-b-[24px] bg-white p-3">
        <div className="relative h-[120px] w-full box-border rounded-[24px] border border-[#E8E8E8]">
          <span className="absolute left-[24px] top-[12px] h-[17px] w-[351px] text-[14px] leading-[16.9px] font-normal text-black/25">
            Type a message
          </span>
          <div className="absolute bottom-[12px] left-[12px] right-[12px] flex items-center justify-between">
            <div className="flex items-center gap-[4px]">
              <div className="flex h-8 cursor-pointer items-center rounded-[32px] px-2">
                <img
                  alt=""
                  className="h-4 w-4"
                  src={assetUrls.playground.action}
                />
                <span className="ml-[4px] text-[12px] leading-[16px] font-medium text-[#878787]">
                  Action
                </span>
                <img
                  alt=""
                  className="ml-[4px] h-[9.3px] w-[5.3px] opacity-25"
                  src={assetUrls.playground.actionChevron}
                />
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-[32px] hover:bg-black/5">
                <img
                  alt=""
                  className="h-4 w-4"
                  src={assetUrls.playground.tool}
                />
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-[32px] hover:bg-black/5">
                <img
                  alt=""
                  className="h-[14px] w-[13.9px]"
                  src={assetUrls.playground.history}
                />
              </div>
            </div>
            <img
              alt="Send"
              className="h-8 w-8 cursor-pointer"
              src={assetUrls.playground.send}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
