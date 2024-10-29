import { ConfigProvider } from 'antd';
import ReactDOM from 'react-dom/client';
import { globalThemeConfig } from './component/color';
import {
  Playground,
  useStaticPageAgent,
} from './component/playground-component';
import DemoData from './component/playground-demo-ui-context.json';

function mount(id: string) {
  const element = document.getElementById(id);
  const root = ReactDOM.createRoot(element!);

  const agent = useStaticPageAgent(DemoData as any);

  root.render(
    <ConfigProvider theme={globalThemeConfig()}>
      <Playground agent={agent} />
    </ConfigProvider>,
  );
}

export default {
  mount,
};
