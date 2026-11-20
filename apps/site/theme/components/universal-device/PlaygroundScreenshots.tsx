import './playground-screenshots.css';

export function PlaygroundScreenshots({ locale }: { locale: 'zh' | 'en' }) {
  const chinese = locale === 'zh';
  const connectAlt = chinese
    ? 'Playground 连接页面：填写服务地址和 Token，选择设备后点击 Connect'
    : 'Playground connection screen: enter the service URL and token, select a device, and click Connect';
  const connectedAlt = chinese
    ? 'Playground 连接后的页面：在输入框描述任务，也可点击或滑动右侧手机画面'
    : 'Connected Playground: describe a task in the input box, or click and swipe on the phone preview';

  return (
    <div className="universal-device-screenshots">
      <a
        href="/images/universal-device/playground-connect.png"
        target="_blank"
        rel="noreferrer"
      >
        <img
          src="/images/universal-device/playground-connect.png"
          alt={connectAlt}
        />
      </a>
      <a
        className="universal-device-screenshots-connected"
        href="/images/universal-device/playground-connected.png"
        target="_blank"
        rel="noreferrer"
      >
        <img
          src="/images/universal-device/playground-connected.png"
          alt={connectedAlt}
        />
        <span
          className="universal-device-screenshots-task-callout"
          aria-hidden="true"
        >
          Describe a task
        </span>
        <span
          className="universal-device-screenshots-task-arrow"
          aria-hidden="true"
        />
        <span
          className="universal-device-screenshots-callout"
          aria-hidden="true"
        >
          Or click / swipe directly on the screen
        </span>
        <span
          className="universal-device-screenshots-arrow"
          aria-hidden="true"
        />
      </a>
    </div>
  );
}
