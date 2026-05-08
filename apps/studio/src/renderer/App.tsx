import './App.css';
import { ShellLayout } from './components';
import { LocaleProvider } from './i18n';
import { StudioPlaygroundProvider } from './playground/StudioPlaygroundProvider';
import { StudioAntdProvider } from './theme/StudioAntdProvider';
import { ThemeProvider } from './theme/ThemeProvider';

export default function App() {
  return (
    <LocaleProvider>
      <ThemeProvider>
        <StudioAntdProvider>
          <div className="h-full w-full overflow-hidden text-text-primary">
            <StudioPlaygroundProvider>
              <ShellLayout />
            </StudioPlaygroundProvider>
          </div>
        </StudioAntdProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
