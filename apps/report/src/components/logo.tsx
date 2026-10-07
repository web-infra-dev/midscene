import { Logo as VisualizerLogo } from '@midscene/visualizer';
import darkSrc from '../assets/midscene_with_text_dark.webp';
import lightSrc from '../assets/midscene_with_text_light.webp';

export const Logo = ({ hideLogo }: { hideLogo?: boolean }) => (
  <VisualizerLogo hideLogo={hideLogo} lightSrc={lightSrc} darkSrc={darkSrc} />
);
