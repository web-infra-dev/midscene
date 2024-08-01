import { useRef, useState } from 'react';
import { useExecutionDump } from './store';
import './global-hover-preview.less';

const size = 400; // @max-size
const GlobalHoverPreview = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoverTask = useExecutionDump((store) => store.hoverTask);
  const hoverTimestamp = useExecutionDump((store) => store.hoverTimestamp);
  const hoverPreviewConfig = useExecutionDump((store) => store.hoverPreviewConfig);
  const [imageW, setImageW] = useState(size);
  const [imageH, setImageH] = useState(size);

  const images = hoverTask?.recorder
    ?.filter((item) => {
      let valid = Boolean(item.screenshot);
      if (hoverTimestamp) {
        valid = valid && item.ts >= hoverTimestamp;
      }
      return valid;
    })
    .map((item) => item.screenshot);

  const { x, y } = hoverPreviewConfig || {};
  let left = 0;
  let top = 0;

  const shouldShow = images?.length && typeof x !== 'undefined' && typeof y !== 'undefined';
  if (shouldShow) {
    const { clientWidth, clientHeight } = document.body;
    const widthInPractice = imageW >= imageH ? size : size * (imageW / imageH);
    const heightInPractice = imageW >= imageH ? size * (imageH / imageW) : size;
    left = x + widthInPractice > clientWidth ? clientWidth - widthInPractice : x;
    top = y + heightInPractice > clientHeight ? clientHeight - heightInPractice : y;
  }
  // if x + size exceed the screen width, use (screenWidth - size) instead

  return shouldShow ? (
    <div className="global-hover-preview" style={{ left, top }} ref={wrapperRef}>
      {images?.length ? (
        <img
          src={images[0]}
          onLoad={(img) => {
            const imgElement = img.target as HTMLImageElement;
            const width = imgElement.naturalWidth;
            const height = imgElement.naturalHeight;
            setImageW(width);
            setImageH(height);
          }}
        />
      ) : null}
    </div>
  ) : null;
};
export default GlobalHoverPreview;
