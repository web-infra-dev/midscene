export const escapeXmlAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const escapeXmlText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const extractXmlAttribute = (attributes: string, name: string) => {
  const match = attributes.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match?.[1];
};
