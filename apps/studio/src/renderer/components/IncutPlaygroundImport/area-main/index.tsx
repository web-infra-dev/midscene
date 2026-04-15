import { incutPlaygroundImportAssets } from '../assets';
import { IncutImportedMainHeader } from './components/Header';
import { IncutImportedPlaygroundPanel } from './components/Playground';

export function IncutImportedMainArea() {
  return (
    <div className="relative flex h-[820px] w-[1040px] flex-col items-start overflow-hidden bg-[#f6f6f6]">
      <div className="ml-0 mt-1 flex h-[812px] w-[1036px] overflow-hidden rounded-xl border-r border-[#ececec] bg-white">
        <div className="relative flex h-full w-[636px] flex-col bg-white">
          <IncutImportedMainHeader />

          <div className="flex flex-1 flex-col items-center px-[138px] pt-[59.7px]">
            <img
              alt="phone preview"
              className="h-[640.5px] w-[360.4px] object-contain"
              src={incutPlaygroundImportAssets.main.preview}
            />
          </div>
        </div>

        <IncutImportedPlaygroundPanel />
      </div>
    </div>
  );
}
