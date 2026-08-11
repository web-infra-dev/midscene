declare const __MIDSCENE_REPORT_BUILD__: boolean | undefined;

// Consumer builds default to the normal SDK/Playground context. The Report
// Viewer build explicitly replaces this value with true.
export const IS_REPORT_BUILD =
  typeof __MIDSCENE_REPORT_BUILD__ !== 'undefined' && __MIDSCENE_REPORT_BUILD__;
