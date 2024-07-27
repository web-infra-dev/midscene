import { BrowserRouter, Link, Route, Routes } from '@modern-js/runtime/router';
import { Report } from './pages/Report';
import { Home } from './pages/Home';

export default () => {
  return (
    <BrowserRouter>
      <ul>
        <Link to="/">Back to Home</Link>
      </ul>
      <Routes>
        <Route index element={<Home />} />
        <Route path="report" element={<Report />} />
      </Routes>
    </BrowserRouter>
  );
};
