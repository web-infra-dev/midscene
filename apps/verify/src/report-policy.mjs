export function reportContentSecurityPolicy(name) {
  if (name.endsWith('.midscene.html')) {
    return "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src blob:; connect-src 'self' data: blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  }
  return "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'";
}
