(() => {
  var t = {};
  t.r = (t) => {
    'undefined' != typeof Symbol &&
      Symbol.toStringTag &&
      Object.defineProperty(t, Symbol.toStringTag, { value: 'Module' }),
      Object.defineProperty(t, '__esModule', { value: !0 });
  };
  var e = {};
  t.r(e),
    (window.midsceneWaterFlowAnimation = window.midsceneWaterFlowAnimation || {
      styleElement: null,
      mousePointerAttribute: 'data-water-flow-pointer',
      lastCallTime: 0,
      cleanupTimeout: null,
      registerSelfCleaning() {
        (this.lastCallTime = Date.now()),
          this.cleanupTimeout && clearTimeout(this.cleanupTimeout),
          (this.cleanupTimeout = window.setTimeout(() => {
            Date.now() - this.lastCallTime >= 3e4 && this.disable();
          }, 3e4));
      },
      showMousePointer(t, e) {
        this.enable(), this.registerSelfCleaning();
        const r = document.querySelector(`div[${this.mousePointerAttribute}]`);
        if (r) {
          const t = Number(r.getAttribute('data-timeout-id'));
          t && clearTimeout(t);
          const e = Number(r.getAttribute('data-remove-timeout-id'));
          e && clearTimeout(e);
        }
        const n =
          r ||
          (() => {
            const r = document.createElement('div');
            return (
              r.setAttribute(this.mousePointerAttribute, 'true'),
              (r.style.position = 'fixed'),
              (r.style.width = '30px'),
              (r.style.height = '30px'),
              (r.style.borderRadius = '50%'),
              (r.style.backgroundColor = 'rgba(0, 0, 255, 0.3)'),
              (r.style.border = '1px solid rgba(0, 0, 255, 0.3)'),
              (r.style.zIndex = '99999'),
              (r.style.transition = 'all 1s ease-in'),
              (r.style.pointerEvents = 'none'),
              (r.style.left = `${t - 15}px`),
              (r.style.top = `${e - 15}px`),
              document.body.appendChild(r),
              r
            );
          })();
        requestAnimationFrame(() => {
          (n.style.left = `${t - 15}px`),
            (n.style.top = `${e - 15}px`),
            (n.style.opacity = '1');
        });
        const a = setTimeout(() => {
          n.style.opacity = '0';
          const t = setTimeout(() => {
            n.parentNode && document.body.removeChild(n);
          }, 500);
          n.setAttribute('data-remove-timeout-id', String(t));
        }, 3e3);
        n.setAttribute('data-timeout-id', String(a));
      },
      hideMousePointer() {
        this.registerSelfCleaning();
        const t = document.querySelector(`div[${this.mousePointerAttribute}]`);
        t && document.body.removeChild(t);
      },
      enable() {
        if ((this.registerSelfCleaning(), this.styleElement)) {
          if (document.head.contains(this.styleElement)) return;
          this.styleElement = null;
        }
        (this.styleElement = document.createElement('style')),
          (this.styleElement.id = 'water-flow-animation'),
          (this.styleElement.textContent = `
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
    `),
          document.head.appendChild(this.styleElement);
      },
      disable() {
        this.cleanupTimeout &&
          (clearTimeout(this.cleanupTimeout), (this.cleanupTimeout = null)),
          document.querySelectorAll('#water-flow-animation').forEach((t) => {
            document.head.removeChild(t);
          }),
          (this.styleElement = null),
          document
            .querySelectorAll(`div[${this.mousePointerAttribute}]`)
            .forEach((t) => {
              document.body.removeChild(t);
            });
      },
    }),
    window.midsceneWaterFlowAnimation.enable(),
    (module.exports = e);
})();
//# sourceMappingURL=water-flow.js.map
