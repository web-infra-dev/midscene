/** Build client-side compatibility routes from the HTTP redirect manifest. */
export function parseLegacyDocumentRedirects(redirectsFile: string) {
  return redirectsFile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length !== 3) {
        throw new Error(`Invalid _redirects rule: ${line}`);
      }

      const [from, to, status] = parts;
      if (!from.startsWith('/') || !to.startsWith('/')) {
        throw new Error(`_redirects paths must be absolute: ${line}`);
      }
      if (status !== '200' && status !== '301') {
        throw new Error(`Unsupported _redirects status: ${line}`);
      }
      return { from, to, status };
    })
    .filter(
      ({ from, status }) => status === '301' && !/\.(?:png|ico)$/.test(from),
    )
    .map(({ from, to }) => ({
      from: `^${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      to,
    }));
}
