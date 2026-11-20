import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IOSScreenEngine } from './ios-screen';
import { createDetailedPhone } from './phone-mesh';

const FILES: Record<string, string> = {
  base_link: 'base_link.STL',
  link1: 'link1.STL',
  link2_1: 'link2_1.STL',
  link2_2: 'link2_2.STL',
  link3_1: 'link3_1.STL',
  link3_2: 'link3_2.STL',
  link4_1: 'link4_1.STL',
  link4_2: 'link4_2.STL',
  link5: 'link5.STL',
};

interface JointSpec {
  name: string;
  parent: string;
  child: string;
  origin: [number, number, number];
  axis: [number, number, number];
  mimic?: [string, number];
}

const JOINTS: JointSpec[] = [
  {
    name: 'j1',
    parent: 'base_link',
    child: 'link1',
    origin: [-0.005, 0, 0.109],
    axis: [0, 0, 1],
  },
  {
    name: 'j2',
    parent: 'link1',
    child: 'link2_1',
    origin: [0.04350076, -0.03577488, 0.11899568],
    axis: [0, 1, 0],
  },
  {
    name: 'j2_2',
    parent: 'link1',
    child: 'link2_2',
    origin: [0.00452886, -0.0305, 0.1415],
    axis: [0, 1, 0],
    mimic: ['j2', 1],
  },
  {
    name: 'j3',
    parent: 'link2_1',
    child: 'fake_link',
    origin: [-0.00105126, 0.03577488, 0.17500116],
    axis: [0, 1, 0],
  },
  {
    name: 'j3_1',
    parent: 'fake_link',
    child: 'link3_1',
    origin: [0, 0, 0],
    axis: [0, 1, 0],
    mimic: ['j3_2', 1],
  },
  {
    name: 'j4_1',
    parent: 'link3_1',
    child: 'link4_1',
    origin: [0.17496978, -0.017, 0.00325187],
    axis: [0, 1, 0],
    mimic: ['j4_2', -1],
  },
  {
    name: 'j4',
    parent: 'link4_1',
    child: 'link5',
    origin: [0.06599962, 0.017, 0.0310008],
    axis: [0, 0, 1],
  },
  {
    name: 'j3_2',
    parent: 'link2_2',
    child: 'link3_2',
    origin: [-0.0010505, 0.0065, 0.17499685],
    axis: [0, 1, 0],
    mimic: ['j2_2', -1],
  },
  {
    name: 'j4_2',
    parent: 'link3_2',
    child: 'link4_2',
    origin: [0.06789659, 0.0005, 0.011972],
    axis: [0, 1, 0],
    mimic: ['j3', 1],
  },
];

export interface ArmCommandState {
  phase: 0 | 1 | 2;
  type: 'tap' | 'swipe';
  nx: number;
  ny: number;
  nx2: number;
  ny2: number;
  progress: number;
}

export interface ArmStageController {
  setActive: (active: boolean) => void;
  setCommandState: (next: ArmCommandState) => void;
  syncScreenTexture: () => void;
  resetView: () => void;
  dispose: () => void;
}

interface Pose {
  j1: number;
  j2: number;
  j3: number;
  j4: number;
  [key: string]: number;
}

function createBreadboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(142, 246, 255, 0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  for (let x = 32; x < canvas.width - 20; x += 64) {
    for (let y = 32; y < canvas.height - 20; y += 64) {
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(142, 246, 255, 0.22)';
      ctx.fill();
    }
  }

  ctx.strokeStyle = 'rgba(142, 246, 255, 0.38)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildStylus(glassMat: THREE.Material): {
  group: THREE.Group;
  nib: THREE.Mesh;
} {
  const group = new THREE.Group();
  const nibMat = new THREE.MeshBasicMaterial({
    color: 0xf4f4f5,
    toneMapped: false,
  });

  const place = (mesh: THREE.Mesh, length: number, x: number) => {
    mesh.rotation.z = -Math.PI / 2;
    mesh.position.x = x + length / 2;
    group.add(mesh);
    return x + length;
  };

  let x = 0;
  x = place(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.008, 24),
      glassMat,
    ),
    0.008,
    x,
  );
  x = place(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.0032, 0.0036, 0.058, 20),
      glassMat,
    ),
    0.058,
    x,
  );
  x = place(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.0034, 0.0034, 0.007, 20),
      glassMat,
    ),
    0.007,
    x,
  );
  x = place(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.0012, 0.0032, 0.018, 16),
      glassMat,
    ),
    0.018,
    x,
  );
  const nib = new THREE.Mesh(new THREE.SphereGeometry(0.003, 16, 16), nibMat);
  nib.position.set(x + 0.002, 0, 0);
  group.add(nib);

  group.position.set(0, 0, -0.072);
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );
  return { group, nib };
}

function buildWorkbench(
  phoneGroup: THREE.Group,
  lineMat: LineMaterial,
): { bench: THREE.Group } {
  const bench = new THREE.Group();
  const plateTex = createBreadboardTexture();
  const plateSideMat = new THREE.MeshBasicMaterial({
    color: 0x8ef6ff,
    transparent: true,
    opacity: 0.08,
  });
  const plateTopMat = new THREE.MeshBasicMaterial({ map: plateTex });

  const plateGeo = new THREE.BoxGeometry(0.5, 0.014, 0.36);
  const plate = new THREE.Mesh(plateGeo, [
    plateSideMat,
    plateSideMat,
    plateTopMat,
    plateSideMat,
    plateSideMat,
    plateSideMat,
  ]);
  plate.position.set(0.02, -0.007, 0);
  bench.add(plate);

  const plateEdges = new THREE.EdgesGeometry(plateGeo);
  const plateLineGeo = new LineSegmentsGeometry();
  plateLineGeo.setPositions(
    Array.from(plateEdges.attributes.position.array as Float32Array),
  );
  plateEdges.dispose();
  const plateLines = new LineSegments2(plateLineGeo, lineMat);
  plateLines.position.copy(plate.position);
  bench.add(plateLines);

  const fixturePos = new THREE.Vector3(0.145, 0, 0.01);
  const fixtureMat = new THREE.MeshBasicMaterial({
    color: 0x8ef6ff,
    transparent: true,
    opacity: 0.22,
  });

  const brackets: [number, number][] = [
    [-0.041, -0.079],
    [0.041, -0.079],
    [-0.041, 0.079],
    [0.041, 0.079],
  ];
  for (const [bx, bz] of brackets) {
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.012, 0.012),
      fixtureMat,
    );
    bracket.position.set(fixturePos.x + bx, 0.006, fixturePos.z + bz);
    bench.add(bracket);
  }

  phoneGroup.rotation.set(-Math.PI / 2, 0, 0);
  phoneGroup.position.set(fixturePos.x, 0.008, fixturePos.z);
  bench.add(phoneGroup);

  return { bench };
}

export async function mountArmWorkbenchStage(
  stageEl: HTMLElement,
  canvas: HTMLCanvasElement,
  iosScreen: IOSScreenEngine,
  signal?: AbortSignal,
): Promise<ArmStageController> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 12);
  const defaultCamPos = new THREE.Vector3(0.86, 0.7, 1.04);
  const defaultTarget = new THREE.Vector3(0.01, 0.11, 0.0);
  camera.position.copy(defaultCamPos);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.36;
  controls.maxDistance = 1.8;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.target.copy(defaultTarget);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(0.6, 1.1, 0.7);
  scene.add(keyLight);

  const glass = new THREE.MeshBasicMaterial({
    color: 0x8ef6ff,
    transparent: true,
    opacity: 0.18,
    depthWrite: true,
    toneMapped: false,
  });

  const hullMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(0xf4f1ea) },
      uWidth: { value: 1.5 },
      uResolution: { value: new THREE.Vector2(800, 600) },
    },
    vertexShader: `
      uniform float uWidth;
      uniform vec2 uResolution;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 viewNormal = normalize(normalMatrix * normal);
        float len = length(viewNormal.xy);
        if (len > 0.18) clip.xy += (viewNormal.xy / len) * uWidth * clip.w * 2.0 / uResolution;
        gl_Position = clip;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 0.82); }
    `,
  });

  const lineMaterial = new LineMaterial({
    color: 0xd8f8ff,
    linewidth: 1.3,
    transparent: true,
    opacity: 0.8,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  lineMaterial.polygonOffset = true;
  lineMaterial.polygonOffsetFactor = -4;
  lineMaterial.polygonOffsetUnits = -4;

  const phone = createDetailedPhone(renderer, iosScreen.canvas);
  const { bench } = buildWorkbench(phone.group, lineMaterial);
  scene.add(bench);

  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(0.008, 0.011, 32),
    new THREE.MeshBasicMaterial({
      color: 0xf4f4f5,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.visible = false;
  scene.add(targetRing);

  const loader = new STLLoader();
  const groups: Record<string, THREE.Group> = { fake_link: new THREE.Group() };

  for (const [name, file] of Object.entries(FILES)) {
    if (signal?.aborted) {
      renderer.dispose();
      pmrem.dispose();
      throw new DOMException('Aborted', 'AbortError');
    }
    const raw = await loader.loadAsync(
      `/images/universal-device/mg400/${file}`,
    );
    const geometry = mergeVertices(raw, 1e-5);
    raw.dispose();
    geometry.computeVertexNormals();

    const g = new THREE.Group();
    g.add(new THREE.Mesh(geometry, glass));

    const hull = new THREE.Mesh(geometry, hullMaterial);
    hull.renderOrder = 1;
    g.add(hull);

    const edges = new THREE.EdgesGeometry(geometry, 42);
    const positions = edges.attributes.position.array as Float32Array;
    edges.dispose();
    if (positions.length >= 6) {
      const lineGeo = new LineSegmentsGeometry();
      lineGeo.setPositions(Array.from(positions));
      const line = new LineSegments2(lineGeo, lineMaterial);
      line.renderOrder = 2;
      g.add(line);
    }

    groups[name] = g;
    await new Promise((r) => requestAnimationFrame(r));
  }

  const pen = buildStylus(glass);
  groups.link5.add(pen.group);

  const chain = JOINTS.map((spec) => {
    const child = groups[spec.child];
    child.position.set(...spec.origin);
    child.userData.axis = new THREE.Vector3(...spec.axis).normalize();
    groups[spec.parent].add(child);
    return spec;
  });

  const armRoot = new THREE.Group();
  armRoot.rotation.x = -Math.PI / 2;
  armRoot.position.set(-0.11, 0, 0);
  armRoot.add(groups.base_link);
  scene.add(armRoot);

  const ringPositions: number[] = [];
  for (let i = 0; i < 72; i += 1) {
    const a0 = (i / 72) * Math.PI * 2;
    const a1 = ((i + 1) / 72) * Math.PI * 2;
    ringPositions.push(
      -0.11 + Math.cos(a0) * 0.11,
      0.002,
      Math.sin(a0) * 0.11,
      -0.11 + Math.cos(a1) * 0.11,
      0.002,
      Math.sin(a1) * 0.11,
    );
  }
  const ringGeo = new LineSegmentsGeometry();
  ringGeo.setPositions(ringPositions);
  scene.add(new LineSegments2(ringGeo, lineMaterial));

  const byName = Object.fromEntries(chain.map((j) => [j.name, j]));
  const pose: Pose = { j1: 0.0, j2: 0.18, j3: 0.62, j4: 0.0 };

  const getJointAngle = (name: string, p: Pose = pose): number => {
    const joint = byName[name];
    if (!joint.mimic) return p[name] || 0;
    return getJointAngle(joint.mimic[0], p) * joint.mimic[1];
  };

  const applyPose = (p: Pose = pose) => {
    for (const joint of chain) {
      const child = groups[joint.child];
      child.quaternion.setFromAxisAngle(
        child.userData.axis as THREE.Vector3,
        getJointAngle(joint.name, p),
      );
    }
    armRoot.updateMatrixWorld(true);
  };

  const solveIK = (targetWorld: THREE.Vector3): Pose => {
    const p: Pose = { j1: 0, j2: 0.55, j3: 0.85, j4: 0 };
    const tip = new THREE.Vector3();
    const tipPlus = new THREE.Vector3();
    const bounds: [number, number][] = [
      [-2.2, 2.2],
      [-0.2, 1.55],
      [-0.2, 1.75],
    ];
    const keys = ['j1', 'j2', 'j3'] as const;
    const eps = 1e-3;
    const lambda = 1e-4;

    for (let iter = 0; iter < 28; iter += 1) {
      applyPose(p);
      pen.nib.getWorldPosition(tip);
      const ex = targetWorld.x - tip.x;
      const ey = targetWorld.y - tip.y;
      const ez = targetWorld.z - tip.z;
      if (ex * ex + ey * ey + ez * ez < 1e-9) break;

      // 3x3 Jacobian columns via finite difference
      const cols: [number, number, number][] = [];
      for (let i = 0; i < 3; i += 1) {
        const k = keys[i];
        const orig = p[k];
        p[k] = orig + eps;
        applyPose(p);
        pen.nib.getWorldPosition(tipPlus);
        p[k] = orig;
        cols.push([
          (tipPlus.x - tip.x) / eps,
          (tipPlus.y - tip.y) / eps,
          (tipPlus.z - tip.z) / eps,
        ]);
      }

      // Build A = J^T J + lambda * I and b = J^T e
      const A = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      const b = [0, 0, 0];
      for (let i = 0; i < 3; i += 1) {
        b[i] = cols[i][0] * ex + cols[i][1] * ey + cols[i][2] * ez;
        for (let j = 0; j < 3; j += 1) {
          A[i][j] =
            cols[i][0] * cols[j][0] +
            cols[i][1] * cols[j][1] +
            cols[i][2] * cols[j][2] +
            (i === j ? lambda : 0);
        }
      }

      // Solve 3x3 system via Gaussian elimination
      for (let i = 0; i < 3; i += 1) {
        let maxRow = i;
        for (let r = i + 1; r < 3; r += 1) {
          if (Math.abs(A[r][i]) > Math.abs(A[maxRow][i])) maxRow = r;
        }
        [A[i], A[maxRow]] = [A[maxRow], A[i]];
        [b[i], b[maxRow]] = [b[maxRow], b[i]];
        const piv = A[i][i];
        if (Math.abs(piv) < 1e-12) continue;
        for (let r = i + 1; r < 3; r += 1) {
          const factor = A[r][i] / piv;
          for (let c = i; c < 3; c += 1) A[r][c] -= factor * A[i][c];
          b[r] -= factor * b[i];
        }
      }
      const dq = [0, 0, 0];
      for (let i = 2; i >= 0; i -= 1) {
        let sum = b[i];
        for (let c = i + 1; c < 3; c += 1) sum -= A[i][c] * dq[c];
        dq[i] = Math.abs(A[i][i]) > 1e-12 ? sum / A[i][i] : 0;
      }

      for (let i = 0; i < 3; i += 1) {
        const k = keys[i];
        const step = THREE.MathUtils.clamp(dq[i], -0.35, 0.35);
        p[k] = THREE.MathUtils.clamp(p[k] + step, bounds[i][0], bounds[i][1]);
      }
      p.j4 = -p.j1;
    }
    return { ...p };
  };

  bench.updateMatrixWorld(true);
  const readyPose: Pose = { j1: 0.0, j2: 0.18, j3: 0.62, j4: 0.0 };
  const poseCache = new Map<
    string,
    { hover: Pose; contact: Pose; worldContact: THREE.Vector3 }
  >();

  const getHoverContact = (nx: number, ny: number) => {
    const key = `${nx.toFixed(3)},${ny.toFixed(3)}`;
    let cached = poseCache.get(key);
    if (!cached) {
      const localPt = phone.normalizedToLocal(nx, ny);
      const worldContact = localPt
        .clone()
        .applyMatrix4(phone.group.matrixWorld);
      const worldTipContact = worldContact
        .clone()
        .add(new THREE.Vector3(0, 0.0022, 0));
      const worldHover = worldTipContact
        .clone()
        .add(new THREE.Vector3(0, 0.024, 0));
      cached = {
        hover: solveIK(worldHover),
        contact: solveIK(worldTipContact),
        worldContact,
      };
      poseCache.set(key, cached);
    }
    return cached;
  };

  applyPose(readyPose);

  let cmdState: ArmCommandState = {
    phase: 0,
    type: 'tap',
    nx: 0.39,
    ny: 0.35,
    nx2: 0.39,
    ny2: 0.35,
    progress: 0,
  };
  let isActive = true;

  const resize = () => {
    const w = stageEl.clientWidth || 640;
    const h = stageEl.clientHeight || 540;
    if (w < 2 || h < 2) return;
    camera.aspect = w / h;
    const pipOffset = w > 520 ? Math.round(w * 0.12) : 0;
    camera.setViewOffset(w, h, pipOffset, 0, w, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    const buffer = new THREE.Vector2(
      renderer.domElement.width,
      renderer.domElement.height,
    );
    lineMaterial.resolution.copy(buffer);
    hullMaterial.uniforms.uResolution.value.copy(buffer);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stageEl);
  resize();

  const lerpPoseObj = (a: Pose, b: Pose, t: number): Pose => ({
    j1: THREE.MathUtils.lerp(a.j1, b.j1, t),
    j2: THREE.MathUtils.lerp(a.j2, b.j2, t),
    j3: THREE.MathUtils.lerp(a.j3, b.j3, t),
    j4: THREE.MathUtils.lerp(a.j4, b.j4, t),
  });

  renderer.setAnimationLoop(() => {
    if (!isActive || document.hidden) return;

    const { phase, type, nx, ny, nx2, ny2, progress } = cmdState;
    let desired = readyPose;

    if (phase === 0) {
      desired = readyPose;
      targetRing.visible = false;
    } else if (phase === 1) {
      const p1 = getHoverContact(nx, ny);
      desired = lerpPoseObj(
        readyPose,
        p1.hover,
        THREE.MathUtils.smoothstep(progress, 0, 1),
      );
      targetRing.visible = true;
      targetRing.position
        .copy(p1.worldContact)
        .add(new THREE.Vector3(0, 0.001, 0));
      targetRing.scale.setScalar(1 + Math.sin(progress * Math.PI * 2) * 0.15);
    } else if (phase === 2) {
      const p1 = getHoverContact(nx, ny);
      targetRing.visible = true;
      targetRing.position
        .copy(p1.worldContact)
        .add(new THREE.Vector3(0, 0.001, 0));
      if (type === 'swipe') {
        const p2 = getHoverContact(nx2, ny2);
        if (progress < 0.2) {
          desired = lerpPoseObj(p1.hover, p1.contact, progress / 0.2);
        } else if (progress < 0.8) {
          desired = lerpPoseObj(
            p1.contact,
            p2.contact,
            THREE.MathUtils.smoothstep((progress - 0.2) / 0.6, 0, 1),
          );
        } else {
          desired = lerpPoseObj(p2.contact, p2.hover, (progress - 0.8) / 0.2);
        }
      } else {
        let down = 0;
        if (progress < 0.35)
          down = THREE.MathUtils.smoothstep(progress / 0.35, 0, 1);
        else if (progress < 0.65) down = 1;
        else
          down = 1 - THREE.MathUtils.smoothstep((progress - 0.65) / 0.35, 0, 1);
        desired = lerpPoseObj(p1.hover, p1.contact, down);
      }
    }

    const follow = phase === 0 ? 0.18 : 0.72;
    pose.j1 = THREE.MathUtils.lerp(pose.j1, desired.j1, follow);
    pose.j2 = THREE.MathUtils.lerp(pose.j2, desired.j2, follow);
    pose.j3 = THREE.MathUtils.lerp(pose.j3, desired.j3, follow);
    pose.j4 = THREE.MathUtils.lerp(pose.j4, desired.j4, follow);
    applyPose(pose);

    controls.update();
    renderer.render(scene, camera);
  });

  stageEl.classList.add('ready');

  return {
    setActive(active: boolean) {
      isActive = active;
      if (active) resize();
    },
    setCommandState(next: ArmCommandState) {
      cmdState = next;
    },
    syncScreenTexture() {
      phone.syncTexture();
    },
    resetView() {
      camera.position.copy(defaultCamPos);
      controls.target.copy(defaultTarget);
      controls.update();
    },
    dispose() {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
