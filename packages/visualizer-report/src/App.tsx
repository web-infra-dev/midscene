import { BrowserRouter, Route, Routes } from '@modern-js/runtime/router';
import { Report } from './pages/Report';
import { Home } from './pages/Home';

export default () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Home />} />
        <Route path="report" element={<Report />} />
      </Routes>
    </BrowserRouter>
  );
};
