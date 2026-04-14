import './App.css';
import { ShellLayout } from './components';
import { StudioPlaygroundProvider } from './playground/StudioPlaygroundProvider';
import { ThemeProvider } from './theme/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider>
      <div className="h-full w-full overflow-hidden bg-app-bg text-text-primary">
        <StudioPlaygroundProvider>
          <ShellLayout />
        </StudioPlaygroundProvider>
      </div>
    </ThemeProvider>
  );
}
