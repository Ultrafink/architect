import * as THREE from 'three';
import { ModelScene } from './ModelScene';
import { useApp } from '../store';

export const DEFAULT_MODEL = import.meta.env.BASE_URL + 'models/2025_0722_MFHEldagsen-LPH4-3D-Ansicht-_3D_.fbx';

const levelStoreKey = (file: string) => `a3d.levels.${file}`;

export function saveManualLevels(m: ModelScene) {
  const map: Record<string, string> = {};
  m.elements.forEach((el) => { if (el.level !== el.autoLevel) map[el.revitId ?? el.name] = el.level; });
  try { localStorage.setItem(levelStoreKey(m.info.fileName), JSON.stringify(map)); } catch { /* ignore */ }
}

async function fetchWithProgress(url: string, onProgress: (p: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (HTTP ${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const out = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, got);
    got += value.length;
    onProgress(got / total);
  }
  return out.buffer;
}

const tick = () => new Promise((r) => setTimeout(r, 30));

export async function loadModel(source: { url: string; name: string } | File) {
  const st = useApp.getState();
  const name = source instanceof File ? source.name : source.name;
  const ext = name.toLowerCase().split('.').pop();
  if (!['fbx', 'glb', 'gltf'].includes(ext ?? '')) {
    st.toast('Nicht unterstütztes Format. Bitte eine .fbx- oder .glb-Datei wählen.', 'error');
    return;
  }
  st.set({ loading: { active: true, progress: 0, stage: 'Datei wird gelesen …' }, error: null });
  try {
    const buf = source instanceof File
      ? await source.arrayBuffer()
      : await fetchWithProgress(source.url, (p) => useApp.getState().set({ loading: { active: true, progress: p * 0.6, stage: 'Datei wird geladen …' } }));
    useApp.getState().set({ loading: { active: true, progress: 0.65, stage: 'Geometrie wird aufbereitet …' } });
    await tick();
    const model = await ModelScene.load(buf, name);
    useApp.getState().set({ loading: { active: true, progress: 0.92, stage: 'Geschosse und Materialien …' } });
    await tick();

    // manual level assignments from a previous session
    try {
      const saved = JSON.parse(localStorage.getItem(levelStoreKey(name)) || '{}') as Record<string, string>;
      let n = 0;
      model.elements.forEach((el) => {
        const k = saved[el.revitId ?? el.name];
        if (k && model.groups.has(k)) { model.setLevel(el.id, k); n++; }
      });
      if (n) useApp.getState().toast(`${n} manuelle Geschosszuordnungen wiederhergestellt.`);
    } catch { /* ignore */ }

    const old = useApp.getState().model;
    old?.dispose();

    const lv: Record<string, boolean> = {};
    model.levels.forEach((l) => (lv[l.key] = true));
    const b = model.buildingBox;
    const c = b.getCenter(new THREE.Vector3());
    const eg = model.levels.find((l) => l.kind === 'storey');
    useApp.getState().set({
      model,
      version: useApp.getState().version + 1,
      levelVisible: lv,
      selected: [], isolated: null, hiddenCount: 0, explode: 0, measurements: [],
      sections: {
        y: { enabled: false, value: +((eg?.elevation ?? b.min.y) + 1.2).toFixed(2), flip: false },
        x: { enabled: false, value: +c.x.toFixed(2), flip: false },
        z: { enabled: false, value: +c.z.toFixed(2), flip: false },
      },
      loading: { active: false, progress: 1, stage: '' },
    });
    model.info.notes.forEach((n) => console.info('[Modell]', n));
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    useApp.getState().set({ loading: { active: false, progress: 0, stage: '' }, error: `Das Modell konnte nicht geladen werden: ${msg}` });
  }
}
