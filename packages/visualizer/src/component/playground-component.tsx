import {
  BorderOutlined,
  HistoryOutlined,
  LoadingOutlined,
  SendOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { GroupedActionDump, UIContext } from '@midscene/core';
import { Helmet } from '@modern-js/runtime/head';
import { Alert, Button, Checkbox, Spin, Tooltip, message } from 'antd';
import { Form, Input } from 'antd';
import { Radio } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Blackboard from './blackboard';
import { iconForStatus } from './misc';
import { Player } from './player';
import DemoData from './playground-demo-ui-context.json';
import type { ReplayScriptsInfo } from './replay-scripts';
import { allScriptsFromDump } from './replay-scripts';
import './playground-component.less';

import { overrideAIConfig } from '@midscene/core/env';
import type { ChromeExtensionProxyPageAgent } from '@midscene/web/chrome-extension';
import {
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
  StaticPage,
  StaticPageAgent,
} from '@midscene/web/playground';
import type { WebUIContext } from '@midscene/web/utils';
import type { MenuProps } from 'antd';
import { Dropdown, Space } from 'antd';
import { EnvConfig } from './env-config';
import { Logo } from './logo';
import type { HistoryItem } from './store/history';
import { useEnvConfig } from './store/store';

// 重新导出新的模块化组件
export { Playground, StaticPlayground } from './playground';

// 重新导出静态代理相关功能
export {
  useStaticPageAgent,
  staticAgentFromContext,
} from './playground/useStaticPageAgent';

// 重新导出服务器状态检查相关功能
export { useServerValid } from './playground/useServerValid';
