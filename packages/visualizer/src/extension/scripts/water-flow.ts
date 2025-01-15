const midsceneWaterFlowAnimation = {
  styleElement: null as null | HTMLStyleElement,

  mousePointerAttribute: 'data-water-flow-pointer',

  showMousePointer(x: number, y: number) {
    const existingPointer = document.querySelector(
      `div[${this.mousePointerAttribute}]`,
    ) as HTMLDivElement | null;

    // Clear any existing timeouts to prevent race conditions
    if (existingPointer) {
      const timeoutId = Number(existingPointer.getAttribute('data-timeout-id'));
      if (timeoutId) clearTimeout(timeoutId);
      const removeTimeoutId = Number(
        existingPointer.getAttribute('data-remove-timeout-id'),
      );
      if (removeTimeoutId) clearTimeout(removeTimeoutId);
    }

    const size = 30;
    const pointer =
      existingPointer ||
      (() => {
        const p = document.createElement('div');
        p.setAttribute(this.mousePointerAttribute, 'true');
        p.style.position = 'fixed';
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.borderRadius = '50%';
        p.style.backgroundColor = 'rgba(0, 0, 255, 0.3)';
        p.style.border = '1px solid rgba(0, 0, 255, 0.3)';
        p.style.zIndex = '99999';
        p.style.transition = 'opacity 0.5s ease-in-out';
        p.style.pointerEvents = 'none'; // Make pointer not clickable
        document.body.appendChild(p);
        return p;
      })();

    // Update position and opacity
    pointer.style.left = `${x - size / 2}px`; // Subtract half width to center
    pointer.style.top = `${y - size / 2}px`; // Subtract half height to center
    pointer.style.opacity = '1';

    // Set new timeouts
    const fadeTimeoutId = setTimeout(() => {
      pointer.style.opacity = '0';
      const removeTimeoutId = setTimeout(() => {
        if (pointer.parentNode) {
          document.body.removeChild(pointer);
        }
      }, 500);
      pointer.setAttribute('data-remove-timeout-id', String(removeTimeoutId));
    }, 2000);
    pointer.setAttribute('data-timeout-id', String(fadeTimeoutId));
  },

  hideMousePointer() {
    const pointer = document.querySelector(
      `div[${this.mousePointerAttribute}]`,
    ) as HTMLDivElement | null;
    if (pointer) {
      document.body.removeChild(pointer);
    }
  },

  enable() {
    if (this.styleElement) return;
    // Check if water flow animation style already exists
    const existingStyle = document.querySelector('#water-flow-animation');
    if (existingStyle) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'water-flow-animation';
    this.styleElement.textContent = `
    html::before {
      content: "";
      position: fixed;
      top: 0; right: 0; bottom: 0; left: 0;
      pointer-events: none;
      z-index: 9999;
      background:
        linear-gradient(to right, rgba(30, 144, 255, 0.4), transparent 50%) left,
        linear-gradient(to left, rgba(30, 144, 255, 0.4), transparent 50%) right,
        linear-gradient(to bottom, rgba(30, 144, 255, 0.4), transparent 50%) top,
        linear-gradient(to top, rgba(30, 144, 255, 0.4), transparent 50%) bottom;
      background-repeat: no-repeat;
      background-size: 10% 100%, 10% 100%, 100% 10%, 100% 10%;
      animation: waterflow 5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      filter: blur(8px);
    }

    @keyframes waterflow {
      0%, 100% {
        background-image:
          linear-gradient(to right, rgba(30, 144, 255, 0.4), transparent 50%),
          linear-gradient(to left, rgba(30, 144, 255, 0.4), transparent 50%),
          linear-gradient(to bottom, rgba(30, 144, 255, 0.4), transparent 50%),
          linear-gradient(to top, rgba(30, 144, 255, 0.4), transparent 50%);
        transform: scale(1);
      }
      25% {
        background-image:
          linear-gradient(to right, rgba(30, 144, 255, 0.39), transparent 52%),
          linear-gradient(to left, rgba(30, 144, 255, 0.39), transparent 52%),
          linear-gradient(to bottom, rgba(30, 144, 255, 0.39), transparent 52%),
          linear-gradient(to top, rgba(30, 144, 255, 0.39), transparent 52%);
        transform: scale(1.03);
      }
      50% {
        background-image:
          linear-gradient(to right, rgba(30, 144, 255, 0.38), transparent 55%),
          linear-gradient(to left, rgba(30, 144, 255, 0.38), transparent 55%),
          linear-gradient(to bottom, rgba(30, 144, 255, 0.38), transparent 55%),
          linear-gradient(to top, rgba(30, 144, 255, 0.38), transparent 55%);
        transform: scale(1.05);
      }
      75% {
        background-image:
          linear-gradient(to right, rgba(30, 144, 255, 0.39), transparent 52%),
          linear-gradient(to left, rgba(30, 144, 255, 0.39), transparent 52%),
          linear-gradient(to bottom, rgba(30, 144, 255, 0.39), transparent 52%),
          linear-gradient(to top, rgba(30, 144, 255, 0.39), transparent 52%);
        transform: scale(1.03);
      }
    }
    `;
    document.head.appendChild(this.styleElement);
  },

  disable() {
    const styleElements = document.querySelectorAll(
      '[id="water-flow-animation"]',
    );
    styleElements.forEach((element) => {
      document.head.removeChild(element);
    });
    this.styleElement = null;

    // remove all mouse pointers
    const mousePointers = document.querySelectorAll(
      `div[${this.mousePointerAttribute}]`,
    );
    mousePointers.forEach((element) => {
      document.body.removeChild(element);
    });
  },
};

export {};
declare global {
  interface Window {
    midsceneWaterFlowAnimation: typeof midsceneWaterFlowAnimation;
  }
}
(window as any).midsceneWaterFlowAnimation = midsceneWaterFlowAnimation;
(window as any).midsceneWaterFlowAnimation.enable();
