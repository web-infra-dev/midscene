import { Helmet } from '@modern-js/runtime/head';
import { Visualizer } from '@midscene/visualizer';
import { useEffect, useState } from 'react';
import './index.css';

declare module '@midscene/visualizer' {
  export function Visualizer(dumpInfo: any): any;
}

const Index = () => {
  const [dumpJson, setDumpJson] = useState<any>(null);
  const [isLoading, setLoading] = useState<any>(true);
  useEffect(() => {
    fetch('/latest.web-dump.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setDumpJson(data);
        console.log('data', data); // 在此处处理 JSON 数据
      })
      .catch((error) => console.error('Error:', error))
      .finally(() => {
        setLoading(false);
      });
  }, []);
  return (
    <div className="container-box">
      {/* <Helmet>
        <link
          rel="icon"
          type="image/x-icon"
          href="https://lf3-static.bytednsdoc.com/obj/eden-cn/uhbfnupenuhf/favicon.ico"
        />
      </Helmet> */}
      <div>
        <main>{!isLoading && <Visualizer dump={dumpJson} />}</main>
        <div></div>
      </div>
    </div>
  );
};

export default Index;
