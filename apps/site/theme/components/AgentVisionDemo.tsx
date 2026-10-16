const videoBase =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene';
const posterBase =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/luljzkpt/ljhwZthlaukjlkulzlp/homepage';

export function AgentVisionDemo() {
  return (
    <div className="agent-vision-demo" aria-hidden="true">
      {(['light', 'dark'] as const).map((theme) => (
        <video
          key={theme}
          className={`agent-vision-demo__video agent-vision-demo__video--${theme}`}
          src={`${videoBase}/midscene-banner-${theme}.mp4`}
          poster={`${posterBase}/hero-screen-${theme}.png`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ))}
    </div>
  );
}
