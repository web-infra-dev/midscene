import './App.css';
import { ShellLayout } from './components';
import { StudioPlaygroundProvider } from './playground/StudioPlaygroundProvider';
import { StudioRecorderProvider } from './recorder/StudioRecorderProvider';
import { StudioAntdProvider } from './theme/StudioAntdProvider';
import { ThemeProvider } from './theme/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider>
      <StudioAntdProvider>
        <div className="h-full w-full overflow-hidden text-text-primary">
          <StudioPlaygroundProvider>
            <StudioRecorderProvider>
              <ShellLayout />
            </StudioRecorderProvider>
          </StudioPlaygroundProvider>
        </div>
      </StudioAntdProvider>
    </ThemeProvider>
  );
}
