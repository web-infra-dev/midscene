import './App.css';
import { ShellLayout } from './components';
import { StudioPlaygroundProvider } from './playground/StudioPlaygroundProvider';

export default function App() {
  return (
    <div className="h-full w-full overflow-hidden bg-[#F6F6F6] text-slate-900">
      <StudioPlaygroundProvider>
        <ShellLayout />
      </StudioPlaygroundProvider>
    </div>
  );
}
