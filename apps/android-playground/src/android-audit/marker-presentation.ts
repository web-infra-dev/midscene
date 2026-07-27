export function androidAuditMarkerLabelPlacement(
  rectTop: number,
): 'inside' | 'outside' {
  return rectTop <= 0 ? 'inside' : 'outside';
}
