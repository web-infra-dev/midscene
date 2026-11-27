import { type ReactNode, createContext, useContext } from 'react';

export type Locale = 'en' | 'zh';

export interface TranslationDict {
  stage: {
    tabArm: string;
    tabBle: string;
    tabSoon: string;
    soonDesc: string;
    soonCta: string;
    hudArmTitle: string;
    hudTarget: string;
    hudCamera: string;
    hudState: string;
    hudStateRunning: string;
    hudStateIdle: string;
    hudHint3d: string;
    hudResetView: string;
    hudBleBadge: string;
    hudBleHint: string;
    pipLabel: string;
    panelTitle: string;
    autoPlay: string;
    promptText: string;
    steps: {
      label: string;
      meta: string;
    }[];
  };
}

const en: TranslationDict = {
  stage: {
    tabArm: 'DOBOT MG400',
    tabBle: 'iOS AirLink',
    tabSoon: 'More showcases',
    soonDesc:
      'Share your Universal Device project. More official showcases are on the way.',
    soonCta: 'Submit a showcase →',
    hudArmTitle: 'MG400 STYLUS',
    hudTarget: 'TARGET',
    hudCamera: 'CAMERA',
    hudState: 'STATE',
    hudStateRunning: 'MOVING',
    hudStateIdle: 'READY',
    hudHint3d: 'Drag to orbit · Scroll to zoom · Click screen or step to run',
    hudResetView: 'Reset View',
    hudBleBadge: 'Bluetooth HID · Paired',
    hudBleHint: 'Click screen or any step to send Bluetooth HID',
    pipLabel: 'DEVICE MIRROR',
    panelTitle: 'Tasks',
    autoPlay: 'Auto-Play',
    promptText: 'Settings → General → About',
    steps: [
      { label: 'Tap Settings', meta: 'tap (448, 316)' },
      { label: 'Scroll to General', meta: 'swipe ↓' },
      { label: 'Tap General', meta: 'tap (280, 396)' },
      { label: 'Tap About', meta: 'tap (280, 232)' },
      { label: 'Assert iOS Version', meta: 'aiAssert' },
    ],
  },
};

const zh: TranslationDict = {
  stage: {
    tabArm: 'DOBOT MG400',
    tabBle: 'iOS AirLink',
    tabSoon: '更多案例',
    soonDesc: '欢迎分享你的 Universal Device 案例。更多官方案例在路上。',
    soonCta: '提交案例 →',
    hudArmTitle: 'MG400 机械臂',
    hudTarget: '目标',
    hudCamera: '相机',
    hudState: '状态',
    hudStateRunning: '执行中',
    hudStateIdle: '就绪',
    hudHint3d: '拖拽旋转视角 · 滚轮缩放 · 点击屏幕或步骤执行',
    hudResetView: '重置视角',
    hudBleBadge: '蓝牙 HID · 已配对',
    hudBleHint: '点击屏幕或任意步骤发送 Bluetooth HID 指令',
    pipLabel: '设备镜像',
    panelTitle: '任务流程',
    autoPlay: '自动演示',
    promptText: '设置 → 通用 → 关于本机',
    steps: [
      { label: '点击「设置」', meta: 'tap (448, 316)' },
      { label: '滚动至「通用」', meta: 'swipe ↓' },
      { label: '点击「通用」', meta: 'tap (280, 396)' },
      { label: '点击「关于本机」', meta: 'tap (280, 232)' },
      { label: '校验 iOS 版本', meta: 'aiAssert' },
    ],
  },
};

const dictionaries = { en, zh };
const LocaleContext = createContext<Locale>('en');

export function I18nProvider({
  children,
  locale,
}: { children: ReactNode; locale: Locale }) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  return { locale, t: dictionaries[locale] };
}
