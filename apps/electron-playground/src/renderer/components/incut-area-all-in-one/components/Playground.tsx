const midsceneIconUrl = new URL(
  '../../../../../../site/docs/public/midscene-icon.png',
  import.meta.url,
).href;

export default function Playground() {
  return (
    <div
      className="flex h-full w-[400px] shrink-0 flex-col overflow-hidden rounded-r-[12px] bg-white"
      data-reference-id="7780:177943"
    >
      <div
        className="flex h-[56px] items-center px-[22px]"
        data-reference-id="7780:178102"
      >
        <span
          className="text-[13px] leading-[22.1px] font-medium text-[#0D0D0D]"
          data-reference-id="7780:178105"
        >
          Playground
        </span>
      </div>

      <div className="relative flex-1">
        <img
          alt="Logo"
          className="absolute left-[175.3px] top-[240px] h-12 w-[51px] object-contain"
          data-reference-id="7792:184434"
          src={midsceneIconUrl}
        />
        <h2
          className="absolute left-[81px] top-[307px] h-[44px] w-[240px] text-center font-['Roboto'] text-[18px] leading-[22px] font-semibold text-black"
          data-reference-id="7780:184151"
        >
          Welcome to <br /> Midscene.js Playground!
        </h2>
        <div
          className="absolute left-[41px] top-[365px] h-[176px] w-[320px] whitespace-pre-wrap text-[14px] leading-[22px] text-black/70"
          data-reference-id="7780:184150"
        >
          {`This is a panel for experimenting and testing Midscene.js features. 
You can use natural language instructions to operate the web page, such as clicking buttons, filling in forms, querying information, etc. 
Please enter your instructions in the input box below to start experiencing.`}
        </div>
      </div>

      <div
        className="relative h-[132px] w-full box-border rounded-b-[24px] bg-white p-3"
        data-reference-id="7780:178106"
      >
        <div className="relative h-[120px] w-full box-border rounded-[24px] border border-[#E8E8E8]">
          <span
            className="absolute left-[24px] top-[12px] h-[17px] w-[351px] text-[14px] leading-[16.9px] font-normal text-black/25"
            data-reference-id="7780:178111"
          >
            Type a message
          </span>
          <div className="absolute bottom-[12px] left-[12px] right-[12px] flex items-center justify-between">
            <div className="flex items-center gap-[4px]">
              <div className="flex h-8 cursor-pointer items-center rounded-[32px] px-2">
                <img
                  alt=""
                  className="h-4 w-4"
                  data-reference-id="7780:178115"
                  src="https://lf0-incut.bytedance.net/obj/incut//direct-gen-assets/cmnrfdkyz001l4zj0162mh287/7780_178115-bbe24799867c224ea996cb6082c12c7d-f8c0f6632f93e3a7.png"
                />
                <span
                  className="ml-[4px] text-[12px] leading-[16px] font-medium text-[#878787]"
                  data-reference-id="7780:178116"
                >
                  Action
                </span>
                <img
                  alt=""
                  className="ml-[4px] h-[9.3px] w-[5.3px] opacity-25"
                  data-reference-id="7780:178117"
                  src="https://lf0-incut.bytedance.net/obj/incut//direct-gen-assets/cmnrfdkyz001l4zj0162mh287/7780_178117-8ef0e01e023d80a9a86ab418d5721ee2-bce11df5502a5edc.png"
                />
              </div>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-[32px] hover:bg-black/5"
                data-reference-id="7780:178119"
              >
                <img
                  alt=""
                  className="h-4 w-4"
                  src="https://lf0-incut.bytedance.net/obj/incut//direct-gen-assets/cmnrfdkyz001l4zj0162mh287/7780_178119-3a360071958d6689805c86a6a57ebc05-14b5c35d66704df1.png"
                />
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-[32px] hover:bg-black/5">
                <img
                  alt=""
                  className="h-[14px] w-[13.9px]"
                  data-reference-id="7780:178130"
                  src="https://lf0-incut.bytedance.net/obj/incut//direct-gen-assets/cmnrfdkyz001l4zj0162mh287/7780_178130-41feffde95fdcaaaab3adf6819ed7ce1-94dddad8f397b7ce.png"
                />
              </div>
            </div>
            <img
              alt="Send"
              className="h-8 w-8 cursor-pointer"
              data-reference-id="7780:178133"
              src="https://lf0-incut.bytedance.net/obj/incut//direct-gen-assets/cmnrfdkyz001l4zj0162mh287/7780_178133-76e515e427550c483acc2e40ca9bf975-b7e97f3fdad51478.png"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
