import { useEffect, useRef, useState } from 'react';
import {
  FolderOpen, Maximize, Focus, Box as BoxIcon, Square, MousePointer2, Ruler, EyeOff, Scan, Eye,
  Image as ImageIcon, PanelLeft, PanelRight, RotateCcw, Home, FileDown, ChevronDown, ArrowUpFromLine, Layers,
} from 'lucide-react';
import { useApp } from '../store';
import { api, download } from '../viewer/api';
import { IconButton, actions } from './controls';
import { loadModel } from '../model/loader';
import { measureDraft } from '../viewer/Viewer';

export default function Toolbar() {
  const s = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<null | 'png' | 'views'>(null);
  const [busy, setBusy] = useState(false);
  const has = !!s.model;
  const roof = s.model?.levels.find((l) => l.kind === 'roof');
  const roofOn = roof ? s.levelVisible[roof.key] !== false : false;

  const setTool = (t: 'select' | 'measure') => {
    measureDraft.a = null; measureDraft.hover = null;
    s.set({ tool: t });
  };

  const exportPng = (scale: number) => {
    setMenu(null);
    const url = api.exportPng(scale);
    if (!url) { s.toast('Export fehlgeschlagen – bitte kleinere Auflösung wählen.', 'error'); return; }
    const base = (s.model?.info.fileName ?? 'Ansicht').replace(/\.[^.]+$/, '');
    download(url, `${base}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}_${scale}x.png`);
    s.toast(`PNG exportiert (${scale}× Auflösung).`);
  };

  const exportGlb = async () => {
    const m = s.model;
    if (!m) return;
    setBusy(true);
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const helpers: THREE_Obj[] = [];
      m.root.traverse((o) => { if (o.userData.helper && o.visible) { helpers.push(o); o.visible = false; } });
      const prevMode = m.mode; const prevSel = m.selected;
      m.mode = 'realistic'; m.selected = new Set(); m.applyMaterials();
      // tag meshes (glTF extras) so a re-imported GLB keeps elements, categories and storeys
      const saved = new Map<THREE_Obj, Record<string, unknown>>();
      m.elements.forEach((el) => el.meshes.forEach((mesh) => {
        saved.set(mesh, mesh.userData);
        mesh.userData = { a3dElement: el.id, a3dName: el.name, a3dCategory: el.category, a3dLevel: m.levels.find((l) => l.key === el.level)?.name };
      }));
      let res: unknown;
      try {
        res = await new GLTFExporter().parseAsync(m.root, { binary: true, onlyVisible: true });
      } finally {
        saved.forEach((ud, mesh) => (mesh.userData = ud));
        helpers.forEach((o) => (o.visible = true));
      }
      m.mode = prevMode; m.selected = prevSel; m.applyMaterials();
      const blob = new Blob([res as ArrayBuffer], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      download(url, m.info.fileName.replace(/\.[^.]+$/, '') + '.glb');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      s.toast(`GLB exportiert (${(blob.size / 1048576).toFixed(1)} MB, sichtbare Elemente, Meter, Y oben).`);
    } catch (e) {
      s.toast('GLB-Export fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setBusy(false);
      api.invalidate();
    }
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'v') setTool('select');
      else if (k === 'm') setTool('measure');
      else if (k === 'f') api.fit(s.selected.length && s.model ? s.model.elementBox(s.selected).expandByScalar(1.5) : undefined);
      else if (k === 'h') actions.hideSelected();
      else if (k === 'i') actions.isolateSelected();
      else if (k === 'o') s.set({ ortho: !useApp.getState().ortho });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const close = () => setMenu(null);
    if (menu) window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  return (
    <header className="toolbar">
      <div className="tb-group brand">
        <IconButton icon={<PanelLeft size={18} />} label="Gebäudestruktur ein/aus" active={s.leftOpen} onClick={() => s.set({ leftOpen: !s.leftOpen })} />
        <div className="brand-text">
          <strong>Architektur 3D Viewer</strong>
          <span title={s.model?.info.fileName}>{s.model ? s.model.info.fileName : 'Kein Modell geladen'}</span>
        </div>
      </div>

      <div className="tb-scroll">
        <div className="tb-group">
          <IconButton icon={<FolderOpen size={18} />} label="Modell öffnen (FBX/GLB)" onClick={() => file.current?.click()} />
          <input ref={file} type="file" accept=".fbx,.glb,.gltf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadModel(f); e.target.value = ''; }} />
        </div>
        <div className="tb-group">
          <IconButton icon={<MousePointer2 size={18} />} label="Auswählen" shortcut="V" active={s.tool === 'select'} onClick={() => setTool('select')} disabled={!has} />
          <IconButton icon={<Ruler size={18} />} label="Messen" shortcut="M" active={s.tool === 'measure'} onClick={() => setTool('measure')} disabled={!has} />
        </div>
        <div className="tb-group">
          <IconButton icon={<Focus size={18} />} label="Einpassen" shortcut="F" onClick={() => api.fit(s.selected.length && s.model ? s.model.elementBox(s.selected).expandByScalar(1.5) : undefined)} disabled={!has} />
          <div className="menu-anchor">
            <IconButton icon={<><Home size={18} /><ChevronDown size={12} /></>} label="Standardansichten" onClick={() => setMenu(menu === 'views' ? null : 'views')} disabled={!has} />
            {menu === 'views' && (
              <div className="menu" onPointerDown={(e) => e.stopPropagation()}>
                {([['iso', 'Isometrie'], ['top', 'Draufsicht'], ['front', 'Ansicht Süd'], ['back', 'Ansicht Nord'], ['right', 'Ansicht Ost'], ['left', 'Ansicht West']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => { api.standardView(k); setMenu(null); }}>{l}</button>
                ))}
              </div>
            )}
          </div>
          <IconButton icon={s.ortho ? <Square size={18} /> : <BoxIcon size={18} />} label={s.ortho ? 'Orthografisch (zu Perspektive wechseln)' : 'Perspektive (zu Orthografisch wechseln)'} shortcut="O" active={s.ortho} onClick={() => s.set({ ortho: !s.ortho })} disabled={!has} />
        </div>
        <div className="tb-group">
          <IconButton icon={<EyeOff size={18} />} label="Auswahl ausblenden" shortcut="H" onClick={actions.hideSelected} disabled={!s.selected.length} />
          <IconButton icon={<Scan size={18} />} label="Auswahl isolieren" shortcut="I" onClick={actions.isolateSelected} disabled={!s.selected.length} />
          <IconButton icon={<Eye size={18} />} label="Alle einblenden" onClick={actions.showAll} disabled={!has || (!s.isolated && !s.hiddenCount && Object.values(s.levelVisible).every(Boolean))} />
          <IconButton icon={<ArrowUpFromLine size={18} />} label={roofOn ? 'Dach ausblenden' : 'Dach einblenden'} active={!roofOn && has} onClick={() => roof && s.set({ levelVisible: { ...s.levelVisible, [roof.key]: !roofOn } })} disabled={!roof} />
          <IconButton icon={<Layers size={18} />} label={s.explode > 0 ? 'Explosionsansicht schließen' : 'Explosionsansicht'} active={s.explode > 0} onClick={() => s.set({ explode: s.explode > 0 ? 0 : 1 })} disabled={!has} />
        </div>
        <div className="tb-group">
          <div className="menu-anchor">
            <IconButton icon={<><ImageIcon size={18} /><ChevronDown size={12} /></>} label="PNG exportieren" onClick={() => setMenu(menu === 'png' ? null : 'png')} disabled={!has} />
            {menu === 'png' && (
              <div className="menu" onPointerDown={(e) => e.stopPropagation()}>
                {[1, 2, 3, 4].map((k) => (
                  <button key={k} type="button" onClick={() => exportPng(k)}>
                    {k}× <span className="muted">{Math.round(window.innerWidth * k)} px breit (max. 8192)</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton icon={<FileDown size={18} />} label={busy ? 'GLB wird erzeugt …' : 'Als GLB exportieren (sichtbare Elemente)'} onClick={exportGlb} disabled={!has || busy} />
          <IconButton icon={<Maximize size={18} />} label="Vollbild" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => s.toast('Vollbild wird von diesem Browser nicht unterstützt.', 'error'))} />
          <IconButton icon={<RotateCcw size={18} />} label="Modell vollständig wiederherstellen" onClick={actions.resetAll} disabled={!has} />
        </div>
      </div>

      <div className="tb-group end">
        <IconButton icon={<PanelRight size={18} />} label="Darstellung ein/aus" active={s.rightOpen} onClick={() => s.set({ rightOpen: !s.rightOpen })} />
      </div>
    </header>
  );
}

type THREE_Obj = import('three').Object3D;
