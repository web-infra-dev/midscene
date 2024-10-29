import { ConfigProvider } from 'antd';
import ReactDOM from 'react-dom/client';
import { globalThemeConfig } from './component/color';
import { Playground } from './component/playground-component';

function mount(id: string) {
  const element = document.getElementById(id);
  const root = ReactDOM.createRoot(element!);

  root.render(
    <ConfigProvider theme={globalThemeConfig()}>
      <Playground />
    </ConfigProvider>,
  );
}

export default {
  mount,
};
