import * as THREE from 'three';

export const PHONE_DIMS = {
  width: 0.0715,
  height: 0.1496,
  depth: 0.0082,
  cornerRadius: 0.0108,
  bezel: 0.0024,
} as const;

function roundedRectShape(
  width: number,
  height: number,
  radius: number,
): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.absarc(x + width - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + width, y + height - r);
  shape.absarc(x + width - r, y + height - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + height);
  shape.absarc(x + r, y + height - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

function extrudeSlab(
  width: number,
  height: number,
  radius: number,
  depth: number,
  bevel = 0.0003,
): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(
    roundedRectShape(width, height, radius),
    {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 36,
    },
  );
  geo.translate(0, 0, -depth / 2);
  return geo;
}

export interface DetailedPhoneHandle {
  group: THREE.Group;
  syncTexture: () => void;
  normalizedToLocal: (nx: number, ny: number) => THREE.Vector3;
}

export function createDetailedPhone(
  renderer: THREE.WebGLRenderer,
  screenCanvas: HTMLCanvasElement,
): DetailedPhoneHandle {
  const group = new THREE.Group();
  group.name = 'iphone-16-pro';

  const {
    width: W,
    height: H,
    depth: D,
    cornerRadius: R,
    bezel: B,
  } = PHONE_DIMS;

  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0x3b3e46,
    metalness: 0.88,
    roughness: 0.25,
  });
  const bezelMat = new THREE.MeshStandardMaterial({
    color: 0x07080a,
    metalness: 0.2,
    roughness: 0.18,
  });
  const backGlassMat = new THREE.MeshStandardMaterial({
    color: 0x17191f,
    metalness: 0.15,
    roughness: 0.42,
  });

  const frame = new THREE.Mesh(
    extrudeSlab(W, H, R, D - 0.0006, 0.00035),
    titaniumMat,
  );
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const frontBezel = new THREE.Mesh(
    extrudeSlab(W - 0.0014, H - 0.0014, R - 0.0007, 0.0008, 0.00015),
    bezelMat,
  );
  frontBezel.position.z = D / 2 - 0.0003;
  group.add(frontBezel);

  const backGlass = new THREE.Mesh(
    extrudeSlab(W - 0.0016, H - 0.0016, R - 0.0008, 0.0006, 0.0001),
    backGlassMat,
  );
  backGlass.position.z = -D / 2 + 0.0002;
  group.add(backGlass);

  const addSideBtn = (x: number, y: number, h: number) => {
    const btn = new THREE.Mesh(
      new THREE.BoxGeometry(0.0012, h, 0.0024),
      titaniumMat,
    );
    btn.position.set(x, y, 0);
    group.add(btn);
  };
  addSideBtn(W / 2 + 0.0004, 0.016, 0.017);
  addSideBtn(-W / 2 - 0.0004, 0.036, 0.007);
  addSideBtn(-W / 2 - 0.0004, 0.02, 0.012);
  addSideBtn(-W / 2 - 0.0004, 0.004, 0.012);

  const texture = new THREE.CanvasTexture(screenCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(
    8,
    renderer?.capabilities?.getMaxAnisotropy?.() || 4,
  );

  const screenW = W - B * 2;
  const screenH = H - B * 2;
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(screenW, screenH),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  screenMesh.position.z = D / 2 + 0.00032;
  group.add(screenMesh);

  return {
    group,
    syncTexture() {
      texture.needsUpdate = true;
    },
    normalizedToLocal(nx: number, ny: number) {
      const lx = (nx - 0.5) * screenW;
      const ly = (0.5 - ny) * screenH;
      const lz = D / 2 + 0.00045;
      return new THREE.Vector3(lx, ly, lz);
    },
  };
}
