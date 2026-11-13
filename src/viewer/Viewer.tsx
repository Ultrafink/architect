import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Html, Line } from '@react-three/drei';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useApp } from '../store';
import { api } from './api';
import { HDRI, envForHour, kelvinToColor, sunPosition } from './sun';

const BIG = 1e6;

export default function Viewer() {
  return (
    <Canvas
      className="viewport-canvas"
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ position: [30, 25, 30], fov: 45, near: 0.05, far: 5000 }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <RenderSettings />
      <Lighting />
      <CameraRig />
      <ModelNode />
      <SectionCaps />
      <SectionFrames />
      <Measurements />
      <Interaction />
    </Canvas>
  );
}

/* ------------------------------------------------------------------ renderer settings */

function RenderSettings() {
  const { gl, invalidate } = useThree();
  const { exposure, toneMap } = useApp();
  useEffect(() => {
    gl.toneMapping = toneMap === 'aces' ? THREE.ACESFilmicToneMapping : toneMap === 'agx' ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
    gl.toneMappingExposure = exposure;
    invalidate();
  }, [gl, exposure, toneMap, invalidate]);
  useEffect(() => {
    api.invalidate = invalidate;
    // diagnostics: frames rendered + last frame stats (read-only)
    (window as unknown as { __a3d: unknown }).__a3d = { info: gl.info };
  }, [invalidate, gl]);
  return null;
}

/* ------------------------------------------------------------------ lighting */

function Lighting() {
  const { invalidate } = useThree();
  const s = useApp();
  const light = useRef<THREE.DirectionalLight>(null!);
  const sun = useMemo(() => sunPosition(s.month, s.hour, s.north), [s.month, s.hour, s.north]);
  const night = s.preset === 'nacht' || sun.elevation < -3;
  const envKey = s.preset === 'nacht' ? 'nacht' : envForHour(s.hour, sun.elevation);

  useEffect(() => {
    const m = s.model;
    const l = light.current;
    if (!l) return;
    const box = m ? m.buildingBox : new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 10, 10));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const R = Math.max(5, sphere.radius * 1.15);
    // below the horizon at night: dim moonlight from a fixed direction
    const dir = night ? new THREE.Vector3(-0.4, 0.75, 0.3).normalize() : sun.dir.clone();
    if (dir.y < 0.03) dir.y = 0.03;
    l.position.copy(sphere.center).addScaledVector(dir.normalize(), R * 2.5);
    l.target.position.copy(sphere.center);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
    cam.near = 0.5; cam.far = R * 5;
    cam.updateProjectionMatrix();
    l.shadow.radius = s.shadowSoftness;
    l.shadow.needsUpdate = true;
    // fade sun intensity near the horizon
    const fade = night ? 1 : THREE.MathUtils.smoothstep(sun.elevation, -2, 8);
    l.intensity = s.sunIntensity * fade;
    l.color.copy(kelvinToColor(night ? 8000 : s.colorTemp));
    l.castShadow = s.shadows;
    invalidate();
  }, [s.model, sun, night, s.sunIntensity, s.colorTemp, s.shadows, s.shadowSoftness, invalidate]);

  return (
    <>
      <directionalLight ref={light} castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0004} shadow-normalBias={0.03} />
      <hemisphereLight args={['#dfe8f2', '#5a5248', night ? 0.05 : 0.25]} />
      <Environment
        key={envKey + String(s.showBackground)}
        files={HDRI[envKey]}
        background={s.showBackground}
        environmentIntensity={s.envIntensity}
        backgroundIntensity={night ? 0.6 : 1}
        backgroundBlurriness={0.02}
      />
      {!s.showBackground && <color attach="background" args={['#2a3038']} />}
    </>
  );
}

/* ------------------------------------------------------------------ camera + controls */

function CameraRig() {
  const { gl, size, set, invalidate, scene } = useThree();
  const ortho = useApp((s) => s.ortho);
  const model = useApp((s) => s.model);

  const persp = useMemo(() => new THREE.PerspectiveCamera(45, 1, 0.05, 5000), []);
  const orthoCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000), []);
  const controls = useMemo(() => {
    const c = new OrbitControls(persp, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.screenSpacePanning = true;
    c.maxPolarAngle = Math.PI * 0.98;
    c.zoomToCursor = true;
    return c;
  }, [persp, gl]);
  const tween = useRef<{ p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; z0: number; z1: number; t: number } | null>(null);
  const orthoHeight = useRef(20);

  useEffect(() => {
    const onChange = () => invalidate();
    controls.addEventListener('change', onChange);
    return () => { controls.removeEventListener('change', onChange); controls.dispose(); };
  }, [controls, invalidate]);

  // keep both cameras' projections in sync with the viewport
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    persp.aspect = aspect;
    persp.updateProjectionMatrix();
    const h = orthoHeight.current;
    orthoCam.left = (-h * aspect) / 2; orthoCam.right = (h * aspect) / 2; orthoCam.top = h / 2; orthoCam.bottom = -h / 2;
    orthoCam.updateProjectionMatrix();
    invalidate();
  }, [size, persp, orthoCam, invalidate]);

  // switch projection, preserving framing
  useEffect(() => {
    const from = (controls.object as THREE.Camera);
    const to = ortho ? orthoCam : persp;
    if (from !== to) {
      const dist = from.position.distanceTo(controls.target);
      if (ortho) {
        const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
        orthoHeight.current = h;
        const aspect = size.width / Math.max(1, size.height);
        orthoCam.left = (-h * aspect) / 2; orthoCam.right = (h * aspect) / 2; orthoCam.top = h / 2; orthoCam.bottom = -h / 2;
        orthoCam.zoom = 1;
        orthoCam.position.copy(from.position);
        orthoCam.quaternion.copy(from.quaternion);
        orthoCam.updateProjectionMatrix();
      } else {
        const h = orthoHeight.current / orthoCam.zoom;
        const d = h / (2 * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)));
        const dir = from.position.clone().sub(controls.target).normalize();
        persp.position.copy(controls.target).addScaledVector(dir, d);
        persp.quaternion.copy(from.quaternion);
      }
    }
    controls.object = to;
    set({ camera: to });
    controls.update();
    invalidate();
  }, [ortho]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    set({ camera: persp });
    persp.position.set(30, 25, 30);
    scene.add(persp, orthoCam); // so camera-attached helpers render
    return () => { scene.remove(persp, orthoCam); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startTween = (pos: THREE.Vector3, target: THREE.Vector3, zoom = 1) => {
    const cam = controls.object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    tween.current = { p0: cam.position.clone(), p1: pos, t0: controls.target.clone(), t1: target, z0: cam.zoom, z1: zoom, t: 0 };
    invalidate();
  };

  // register API
  useEffect(() => {
    api.fit = (box, dirIn) => {
      const m = useApp.getState().model;
      const b = box && !box.isEmpty() ? box : m ? m.buildingBox : new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 5, 5));
      const sphere = b.getBoundingSphere(new THREE.Sphere());
      const cam = controls.object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      const dir = dirIn ? dirIn.clone().normalize() : cam.position.clone().sub(controls.target).normalize();
      if (!isFinite(dir.x) || dir.lengthSq() < 0.5) dir.set(1, 0.8, 1).normalize();
      const r = Math.max(0.5, sphere.radius);
      const dist = (r / Math.sin(THREE.MathUtils.degToRad(persp.fov / 2))) * 1.05;
      if ((cam as THREE.OrthographicCamera).isOrthographicCamera) {
        const aspect = size.width / Math.max(1, size.height);
        orthoHeight.current = r * 2.2 * Math.max(1, 1 / aspect);
        orthoCam.left = (-orthoHeight.current * aspect) / 2; orthoCam.right = (orthoHeight.current * aspect) / 2;
        orthoCam.top = orthoHeight.current / 2; orthoCam.bottom = -orthoHeight.current / 2;
        orthoCam.updateProjectionMatrix();
      }
      persp.near = Math.max(0.02, dist / 2000);
      persp.far = Math.max(2000, dist * 40);
      persp.updateProjectionMatrix();
      startTween(sphere.center.clone().addScaledVector(dir, dist), sphere.center.clone(), 1);
    };
    api.standardView = (v) => {
      const dirs: Record<string, THREE.Vector3> = {
        iso: new THREE.Vector3(1, 0.75, 1), top: new THREE.Vector3(0, 1, 0.0001),
        front: new THREE.Vector3(0, 0.08, 1), back: new THREE.Vector3(0, 0.08, -1),
        right: new THREE.Vector3(1, 0.08, 0), left: new THREE.Vector3(-1, 0.08, 0),
      };
      api.fit(undefined, dirs[v]);
    };
    api.getView = () => {
      const cam = controls.object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      return { ortho: !!(cam as THREE.OrthographicCamera).isOrthographicCamera, position: cam.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number], zoom: cam.zoom };
    };
    api.setView = (v) => {
      if (useApp.getState().ortho !== v.ortho) useApp.getState().set({ ortho: v.ortho });
      setTimeout(() => startTween(new THREE.Vector3(...v.position), new THREE.Vector3(...v.target), v.zoom), 30);
    };
    api.exportPng = (scale) => {
      const cam = controls.object as THREE.Camera;
      const pr = gl.getPixelRatio();
      const maxSide = 8192;
      const k = Math.min(scale, maxSide / Math.max(size.width, size.height));
      try {
        gl.setPixelRatio(k);
        gl.setSize(size.width, size.height, false);
        gl.render(scene, cam);
        return gl.domElement.toDataURL('image/png');
      } catch (e) {
        console.error(e);
        return null;
      } finally {
        gl.setPixelRatio(pr);
        gl.setSize(size.width, size.height, false);
        invalidate();
      }
    };
  });

  // initial framing when a model arrives
  useEffect(() => {
    if (model) setTimeout(() => api.standardView('iso'), 50);
  }, [model]);

  useFrame((_, dt) => {
    const tw = tween.current;
    const cam = controls.object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / 0.6);
      const e = 1 - Math.pow(1 - tw.t, 3);
      cam.position.lerpVectors(tw.p0, tw.p1, e);
      controls.target.lerpVectors(tw.t0, tw.t1, e);
      cam.zoom = THREE.MathUtils.lerp(tw.z0, tw.z1, e);
      cam.updateProjectionMatrix();
      if (tw.t >= 1) tween.current = null;
      controls.update();
      invalidate();
      return;
    }
    if (controls.update()) invalidate();
  });
  return null;
}

/* ------------------------------------------------------------------ model state sync */

function ModelNode() {
  const { scene, invalidate } = useThree();
  const s = useApp();
  const m = s.model;
  const explodeCur = useRef(0);

  useEffect(() => {
    if (!m) return;
    scene.add(m.root);
    invalidate();
    return () => { scene.remove(m.root); };
  }, [m, scene, invalidate]);

  useEffect(() => {
    if (!m) return;
    m.isolated = s.isolated ? new Set(s.isolated) : null;
    m.applyVisibility(s.levelVisible);
    invalidate();
  }, [m, s.levelVisible, s.isolated, s.hiddenCount, s.version, invalidate]);

  useEffect(() => {
    if (!m) return;
    m.mode = s.mode;
    m.selected = new Set(s.selected);
    m.applyMaterials();
    invalidate();
  }, [m, s.mode, s.selected, s.version, invalidate]);

  // section planes (mutated in place: no shader recompilation)
  useEffect(() => {
    if (!m) return;
    const { x, y, z } = s.sections;
    const setPlane = (pl: THREE.Plane, axis: THREE.Vector3, st: typeof x) => {
      if (!st.enabled) { pl.normal.copy(axis).negate(); pl.constant = BIG; return; }
      const sign = st.flip ? 1 : -1;
      pl.normal.copy(axis).multiplyScalar(sign);
      pl.constant = -sign * st.value;
    };
    setPlane(m.planes[0], new THREE.Vector3(0, 1, 0), y);
    setPlane(m.planes[1], new THREE.Vector3(1, 0, 0), x);
    setPlane(m.planes[2], new THREE.Vector3(0, 0, 1), z);
    invalidate();
  }, [m, s.sections, invalidate]);

  useFrame((_, dt) => {
    if (!m) return;
    const target = s.explode;
    if (Math.abs(explodeCur.current - target) > 0.0005 || m.explode !== explodeCur.current) {
      explodeCur.current = THREE.MathUtils.damp(explodeCur.current, target, 6, dt);
      if (Math.abs(explodeCur.current - target) < 0.001) explodeCur.current = target;
      m.setExplode(explodeCur.current, s.explodeSpacing);
      invalidate();
    }
  });
  return null;
}

/* ------------------------------------------------------------------ section caps (stencil) */

function SectionCaps() {
  const { scene, invalidate } = useThree();
  const s = useApp();
  const m = s.model;
  const [rev, setRev] = useState(0);
  const capsRef = useRef<{ caps: THREE.Mesh[]; helpers: THREE.Object3D[]; geoms: THREE.BufferGeometry[] } | null>(null);
  const flags = [s.sections.y.enabled, s.sections.x.enabled, s.sections.z.enabled];
  const active = s.caps && s.mode !== 'wireframe' && flags.some(Boolean);

  useEffect(() => { api.rebuildCaps = () => setRev((r) => r + 1); }, []);

  useEffect(() => {
    const clear = () => {
      const c = capsRef.current;
      if (!c) return;
      c.caps.forEach((o) => { scene.remove(o); o.geometry.dispose(); (o.material as THREE.Material).dispose(); });
      c.helpers.forEach((o) => { o.removeFromParent(); (o as THREE.Mesh).traverse((x) => { const mm = (x as THREE.Mesh).material as THREE.Material | undefined; mm?.dispose(); }); });
      c.geoms.forEach((g) => g.dispose());
      capsRef.current = null;
    };
    clear();
    if (!m || !active) { invalidate(); return clear; }

    const timer = setTimeout(() => {
      const caps: THREE.Mesh[] = [];
      const helpers: THREE.Object3D[] = [];
      const geoms: THREE.BufferGeometry[] = [];
      const size = m.modelBox.getSize(new THREE.Vector3()).length() * 1.2;

      // merged closed geometry per level group (local coords of that group)
      const merged = new Map<THREE.Group, THREE.BufferGeometry>();
      m.groups.forEach((g) => {
        if (!g.visible) return;
        const parts: THREE.BufferGeometry[] = [];
        g.children.forEach((c) => {
          const mesh = c as THREE.Mesh;
          if (!mesh.isMesh || !mesh.visible || !mesh.userData.elementId) return;
          const mats = Array.isArray(mesh.userData.realMats) ? mesh.userData.realMats : [mesh.userData.realMats];
          if (mats.every((x: THREE.Material) => x.userData.isGlass)) return;
          const src = mesh.geometry;
          const pos = new THREE.BufferGeometry();
          pos.setAttribute('position', src.attributes.position.clone());
          if (src.index) pos.setIndex(src.index.clone());
          const ni = pos.index ? pos.toNonIndexed() : pos;
          if (ni !== pos) pos.dispose();
          ni.applyMatrix4(mesh.matrix);
          parts.push(ni);
        });
        if (!parts.length) return;
        const mg = mergeGeometries(parts, false);
        parts.forEach((p) => p.dispose());
        if (mg) { merged.set(g, mg); geoms.push(mg); }
      });

      m.planes.forEach((plane, i) => {
        if (!flags[i]) return;
        const order = i + 1;
        const base = new THREE.MeshBasicMaterial({ depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc });
        merged.forEach((geo, g) => {
          const back = base.clone();
          back.side = THREE.BackSide; back.clippingPlanes = [plane];
          back.stencilFail = back.stencilZFail = back.stencilZPass = THREE.IncrementWrapStencilOp;
          const front = base.clone();
          front.side = THREE.FrontSide; front.clippingPlanes = [plane];
          front.stencilFail = front.stencilZFail = front.stencilZPass = THREE.DecrementWrapStencilOp;
          const holder = new THREE.Group();
          holder.userData.helper = true;
          const mb = new THREE.Mesh(geo, back); mb.renderOrder = order; mb.frustumCulled = false;
          const mf = new THREE.Mesh(geo, front); mf.renderOrder = order; mf.frustumCulled = false;
          holder.add(mb, mf);
          g.add(holder);
          helpers.push(holder);
        });
        base.dispose();
        const capMat = new THREE.MeshStandardMaterial({
          color: s.capColor, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
          clippingPlanes: m.planes.filter((p) => p !== plane),
          stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
          stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
        });
        const cap = new THREE.Mesh(new THREE.PlaneGeometry(size, size), capMat);
        cap.renderOrder = order + 0.1;
        cap.frustumCulled = false;
        cap.userData.plane = plane;
        cap.onAfterRender = (r) => r.clearStencil();
        scene.add(cap);
        caps.push(cap);
      });
      capsRef.current = { caps, helpers, geoms };
      invalidate();
    }, 120);
    return () => { clearTimeout(timer); clear(); };
  }, [m, active, flags[0], flags[1], flags[2], s.levelVisible, s.isolated, s.hiddenCount, s.version, rev, scene, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    capsRef.current?.caps.forEach((c) => (c.material as THREE.MeshStandardMaterial).color.set(s.capColor));
    invalidate();
  }, [s.capColor, invalidate]);

  // keep caps on their planes
  useFrame(() => {
    const c = capsRef.current;
    if (!c || !m) return;
    const center = m.buildingBox.getCenter(new THREE.Vector3());
    c.caps.forEach((cap) => {
      const pl = cap.userData.plane as THREE.Plane;
      pl.projectPoint(center, cap.position);
      cap.lookAt(cap.position.x - pl.normal.x, cap.position.y - pl.normal.y, cap.position.z - pl.normal.z);
    });
  });
  return null;
}

/* ------------------------------------------------------------------ section plane frames */

function SectionFrames() {
  const s = useApp();
  const m = s.model;
  if (!m) return null;
  const b = m.buildingBox.clone().expandByScalar(0.6);
  const frames: { pts: [number, number, number][]; key: string }[] = [];
  const { x, y, z } = s.sections;
  if (y.enabled) frames.push({ key: 'y', pts: [[b.min.x, y.value, b.min.z], [b.max.x, y.value, b.min.z], [b.max.x, y.value, b.max.z], [b.min.x, y.value, b.max.z], [b.min.x, y.value, b.min.z]] });
  if (x.enabled) frames.push({ key: 'x', pts: [[x.value, b.min.y, b.min.z], [x.value, b.max.y, b.min.z], [x.value, b.max.y, b.max.z], [x.value, b.min.y, b.max.z], [x.value, b.min.y, b.min.z]] });
  if (z.enabled) frames.push({ key: 'z', pts: [[b.min.x, b.min.y, z.value], [b.max.x, b.min.y, z.value], [b.max.x, b.max.y, z.value], [b.min.x, b.max.y, z.value], [b.min.x, b.min.y, z.value]] });
  return (
    <>
      {frames.map((f) => (
        <Line key={f.key} points={f.pts} color="#f0a43a" lineWidth={1.5} dashed dashSize={0.5} gapSize={0.3} transparent opacity={0.9} depthTest={false} renderOrder={20} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ measurements */

export const measureDraft: { a: THREE.Vector3 | null; hover: THREE.Vector3 | null } = { a: null, hover: null };

function Measurements() {
  const ms = useApp((s) => s.measurements);
  const tool = useApp((s) => s.tool);
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force((n) => n + 1);
    window.addEventListener('a3d-measure', h);
    return () => window.removeEventListener('a3d-measure', h);
  }, []);
  const label = (a: THREE.Vector3, b: THREE.Vector3) => {
    const d = a.distanceTo(b);
    const dy = Math.abs(b.y - a.y);
    const dh = Math.hypot(b.x - a.x, b.z - a.z);
    return { d, dy, dh };
  };
  return (
    <>
      {ms.map((mm) => {
        const a = new THREE.Vector3(...mm.a);
        const b = new THREE.Vector3(...mm.b);
        const { d, dy, dh } = label(a, b);
        const mid = a.clone().lerp(b, 0.5);
        return (
          <group key={mm.id}>
            <Line points={[a, b]} color="#ffd166" lineWidth={2.5} depthTest={false} renderOrder={30} />
            <Marker p={a} />
            <Marker p={b} />
            <Html position={mid} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <div className="measure-label">
                <strong>{fmt(d)} m</strong>
                <span>↕ {fmt(dy)} · ↔ {fmt(dh)}</span>
              </div>
            </Html>
          </group>
        );
      })}
      {tool === 'measure' && measureDraft.a && (
        <group>
          <Marker p={measureDraft.a} />
          {measureDraft.hover && (
            <>
              <Line points={[measureDraft.a, measureDraft.hover]} color="#ffd166" lineWidth={1.5} dashed dashSize={0.2} gapSize={0.1} depthTest={false} renderOrder={30} />
              <Html position={measureDraft.a.clone().lerp(measureDraft.hover, 0.5)} center style={{ pointerEvents: 'none' }}>
                <div className="measure-label live"><strong>{fmt(measureDraft.a.distanceTo(measureDraft.hover))} m</strong></div>
              </Html>
            </>
          )}
        </group>
      )}
    </>
  );
}

function Marker({ p }: { p: THREE.Vector3 }) {
  return (
    <mesh position={p} renderOrder={31}>
      <sphereGeometry args={[0.06, 16, 12]} />
      <meshBasicMaterial color="#ffd166" depthTest={false} transparent />
    </mesh>
  );
}

export const fmt = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------ picking / interaction */

function Interaction() {
  const { gl, camera, invalidate } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastHover = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    const pick = (ev: PointerEvent | MouseEvent) => {
      const m = useApp.getState().model;
      if (!m) return null;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(m.visibleMeshes(), false);
      return hits.find((h) => !m.isClipped(h.point)) ?? null;
    };
    const snap = (hit: THREE.Intersection) => {
      const p = hit.point.clone();
      const mesh = hit.object as THREE.Mesh;
      if (!hit.face) return p;
      const pos = mesh.geometry.attributes.position;
      let best = p, bd = 0.15;
      for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const d = v.distanceTo(p);
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    };
    const onDown = (e: PointerEvent) => { if (e.button === 0) down.current = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const onUp = (e: PointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      const st = useApp.getState();
      const hit = pick(e);
      if (st.tool === 'measure') {
        if (!hit) return;
        const p = snap(hit);
        if (!measureDraft.a) measureDraft.a = p;
        else {
          const a = measureDraft.a;
          measureDraft.a = null; measureDraft.hover = null;
          st.set({ measurements: [...st.measurements, { id: crypto.randomUUID?.() ?? String(Date.now()), a: a.toArray() as [number, number, number], b: p.toArray() as [number, number, number] }] });
        }
        window.dispatchEvent(new Event('a3d-measure'));
        invalidate();
        return;
      }
      const id = hit?.object.userData.elementId as string | undefined;
      const add = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!id) { if (!add) st.set({ selected: [] }); return; }
      if (add) st.set({ selected: st.selected.includes(id) ? st.selected.filter((x) => x !== id) : [...st.selected, id] });
      else st.set({ selected: [id] });
    };
    const onMove = (e: PointerEvent) => {
      const st = useApp.getState();
      if (st.tool !== 'measure' || !measureDraft.a || down.current) return;
      const now = performance.now();
      if (now - lastHover.current < 40) return;
      lastHover.current = now;
      const hit = pick(e);
      measureDraft.hover = hit ? snap(hit) : null;
      window.dispatchEvent(new Event('a3d-measure'));
      invalidate();
    };
    const onDbl = (e: MouseEvent) => {
      const st = useApp.getState();
      if (st.tool !== 'select' || !st.model) return;
      const hit = pick(e);
      const id = hit?.object.userData.elementId as string | undefined;
      if (id) { st.set({ selected: [id] }); api.fit(st.model.elementBox([id]).expandByScalar(1.5)); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        measureDraft.a = null; measureDraft.hover = null;
        window.dispatchEvent(new Event('a3d-measure'));
        useApp.getState().set({ selected: [] });
        invalidate();
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('dblclick', onDbl);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('dblclick', onDbl);
      window.removeEventListener('keydown', onKey);
    };
  }, [gl, camera, ray, invalidate]);
  return null;
}
