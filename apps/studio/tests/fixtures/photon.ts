// MainContent tests do not execute the image-processing branch. This keeps
// Vite from resolving Photon's browser-only WASM package in jsdom.
export {};
