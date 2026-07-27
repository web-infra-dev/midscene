import type { PreviewOverlayRenderContext } from '@midscene/playground-app';
import {
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useState,
} from 'react';
import { useAndroidAudit } from './AndroidAuditContext';
import { androidAuditMarkerLabelPlacement } from './marker-presentation';

const STATUS_LABELS = {
  'cache-xpath-hit': 'Cache XPath Hit',
  'tree-only-positional': 'Structural XPath Only',
  'exposed-no-safe-xpath': 'Exposed Without Safe XPath',
  'not-exposed': 'Not Exposed in Tree',
  'point-selected-other': 'Point Selected Another Node',
  pending: 'Awaiting Fresh Validation',
} as const;

const STATUS_DESCRIPTIONS: Record<keyof typeof STATUS_LABELS, string> = {
  'cache-xpath-hit':
    'Green: A safe cache XPath was generated and matched the same target in a subsequent fresh tree.',
  'tree-only-positional':
    'Yellow: The node is present in the Accessibility tree, but only has an order-sensitive structural XPath and is not cached.',
  'exposed-no-safe-xpath':
    'Red: The node is present in the Accessibility tree, but its identity is duplicated or lacks fields that are safe to replay.',
  'not-exposed':
    'Red: The element comes from a visual scan or manual rectangle and has no corresponding Accessibility tree node.',
  'point-selected-other':
    'Purple: The visual point intersects overlapping nodes and production point selection chose another node.',
  pending:
    'Gray: A candidate was generated from the source tree and is awaiting validation against the next tree.',
};

export function AndroidAuditOverlay({
  deviceSize,
}: PreviewOverlayRenderContext) {
  const audit = useAndroidAudit();
  const [drag, setDrag] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
  }>();
  const logicalSize = audit.state.source?.logicalSize ?? deviceSize;
  const overlays = useMemo(
    () =>
      audit.state.overlays.map((overlay, index) => ({
        ...overlay,
        index: index + 1,
      })),
    [audit.state.overlays],
  );

  const dragRect = drag
    ? {
        left: Math.min(drag.startX, drag.x),
        top: Math.min(drag.startY, drag.y),
        width: Math.abs(drag.x - drag.startX),
        height: Math.abs(drag.y - drag.startY),
      }
    : undefined;

  const eventPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * logicalSize.width,
      y: ((event.clientY - bounds.top) / bounds.height) * logicalSize.height,
    };
  };

  return (
    <div
      className={`android-audit-overlay${audit.interactionMode === 'mark' ? ' marking' : ''}`}
      onPointerDown={(event) => {
        if (audit.interactionMode !== 'mark') return;
        const point = eventPoint(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({
          startX: point.x,
          startY: point.y,
          x: point.x,
          y: point.y,
        });
      }}
      onPointerMove={(event) => {
        if (!drag || audit.interactionMode !== 'mark') return;
        const point = eventPoint(event);
        setDrag((current) =>
          current ? { ...current, x: point.x, y: point.y } : current,
        );
      }}
      onPointerUp={(event) => {
        if (!dragRect || audit.interactionMode !== 'mark') return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDrag(undefined);
        if (dragRect.width < 4 || dragRect.height < 4) return;
        const name = window.prompt(
          'What should this visual element be called?',
          'Manually annotated element',
        );
        if (!name?.trim()) return;
        const description = window.prompt(
          'Add a locating description, such as its position, icon, or interaction semantics.',
          name,
        );
        if (!description?.trim()) return;
        void audit.addVisualElement({
          description: description.trim(),
          name: name.trim(),
          rect: dragRect,
        });
      }}
      style={{
        pointerEvents: audit.interactionMode === 'mark' ? 'auto' : 'none',
      }}
    >
      {overlays.map((overlay) => {
        const selected = overlay.visualElementId
          ? overlay.visualElementId === audit.selectedVisualElementId
          : overlay.nodeId === audit.selectedNodeId;
        const label = STATUS_LABELS[overlay.status];
        const labelPlacement = androidAuditMarkerLabelPlacement(
          overlay.rect.top,
        );
        return (
          <button
            aria-label={`${overlay.index}. ${overlay.name}: ${label}`}
            className={`android-audit-marker status-${overlay.status} label-${labelPlacement}${selected ? ' selected' : ''}`}
            data-tooltip={`${label}: ${overlay.statusReason || 'No additional details'}`}
            key={`${overlay.nodeId ?? overlay.name}-${overlay.index}`}
            onClick={(event) => {
              event.stopPropagation();
              if (audit.interactionMode === 'inspect') {
                audit.selectOverlay(
                  overlay.nodeId ?? undefined,
                  overlay.visualElementId,
                );
              }
            }}
            style={{
              height: `${(overlay.rect.height / logicalSize.height) * 100}%`,
              left: `${(overlay.rect.left / logicalSize.width) * 100}%`,
              pointerEvents:
                audit.interactionMode === 'inspect' ? 'auto' : 'none',
              top: `${(overlay.rect.top / logicalSize.height) * 100}%`,
              width: `${(overlay.rect.width / logicalSize.width) * 100}%`,
            }}
            type="button"
          >
            <span>{overlay.index}</span>
          </button>
        );
      })}
      {dragRect && (
        <div
          className="android-audit-draft-rect"
          style={{
            height: `${(dragRect.height / logicalSize.height) * 100}%`,
            left: `${(dragRect.left / logicalSize.width) * 100}%`,
            top: `${(dragRect.top / logicalSize.height) * 100}%`,
            width: `${(dragRect.width / logicalSize.width) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

export { STATUS_DESCRIPTIONS, STATUS_LABELS };
