import { BrowserRouter, Route, Routes } from '@modern-js/runtime/router';
import { Home } from './pages/Home';
import { Report } from './pages/Report';

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
