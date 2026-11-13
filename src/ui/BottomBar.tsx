import { FlipHorizontal2, RotateCcw } from 'lucide-react';
import { useApp, type SectionState } from '../store';
import { Slider } from './controls';
import { kote } from './StructurePanel';
import { fmt } from '../viewer/Viewer';

export default function BottomBar() {
  const s = useApp();
  const m = s.model;
  if (!m) return <footer className="bottombar" />;
  const b = m.buildingBox;
  const storeys = m.levels.filter((l) => l.kind === 'storey');

  const toggle = (k: string) => s.set({ levelVisible: { ...s.levelVisible, [k]: s.levelVisible[k] === false } });
  const solo = (k: string) => {
    const lv: Record<string, boolean> = {};
    m.levels.forEach((l) => (lv[l.key] = l.key === k));
    s.set({ levelVisible: lv });
  };
  const upTo = (k: string) => {
    const idx = storeys.findIndex((l) => l.key === k);
    const lv: Record<string, boolean> = {};
    m.levels.forEach((l) => {
      if (l.kind === 'storey') lv[l.key] = storeys.indexOf(l) <= idx;
      else if (l.kind === 'roof') lv[l.key] = false;
      else lv[l.key] = s.levelVisible[l.key] !== false;
    });
    s.set({ levelVisible: lv });
  };
  const all = () => {
    const lv: Record<string, boolean> = {};
    m.levels.forEach((l) => (lv[l.key] = true));
    s.set({ levelVisible: lv });
  };
  const sec = (axis: 'x' | 'y' | 'z', p: Partial<SectionState>) => s.set({ sections: { ...s.sections, [axis]: { ...s.sections[axis], ...p } } });
  const anySection = s.sections.x.enabled || s.sections.y.enabled || s.sections.z.enabled;

  return (
    <footer className="bottombar">
      <div className="bb-block levels">
        <div className="bb-head">
          <h3>Geschosse</h3>
          <button type="button" className="link" onClick={all}>Alle</button>
        </div>
        <div className="chips">
          {m.levels.map((l) => {
            const on = s.levelVisible[l.key] !== false;
            return (
              <button
                key={l.key} type="button" className={'chip' + (on ? ' on' : '') + ' k-' + l.kind}
                onClick={() => toggle(l.key)} onDoubleClick={() => solo(l.key)}
                title={`${l.name}: Klick ein/aus · Doppelklick nur dieses Geschoss`} aria-pressed={on}
              >
                <span>{l.name}</span>
                {l.kind === 'storey' && <small>{kote(l.elevation)}</small>}
              </button>
            );
          })}
        </div>
        <div className="chips small">
          {storeys.map((l) => (
            <button key={l.key} type="button" className="chip ghost" onClick={() => upTo(l.key)} title="Dieses Geschoss mit allen darunterliegenden zeigen, Dach aus">bis {l.short}</button>
          ))}
        </div>
      </div>

      <div className="bb-block explode">
        <div className="bb-head"><h3>Explosionsansicht</h3></div>
        <Slider label="Spreizung" value={s.explode} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => s.set({ explode: v })} />
        <Slider label="Abstand je Geschoss" value={s.explodeSpacing} min={1} max={12} step={0.5} format={(v) => `${fmt(v)} m`} onChange={(v) => s.set({ explodeSpacing: v })} />
      </div>

      <div className="bb-block sections">
        <div className="bb-head">
          <h3>Schnitte</h3>
          <label className="check inline-check"><input type="checkbox" checked={s.caps} onChange={(e) => s.set({ caps: e.target.checked })} /> Schnittflächen füllen</label>
          <input type="color" className="capcolor" value={s.capColor} aria-label="Farbe der Schnittflächen" onChange={(e) => s.set({ capColor: e.target.value })} />
          <button type="button" className="link" disabled={!anySection} onClick={() => s.set({ sections: { x: { ...s.sections.x, enabled: false }, y: { ...s.sections.y, enabled: false }, z: { ...s.sections.z, enabled: false } } })}><RotateCcw size={12} /> Modell vollständig</button>
        </div>
        <div className="sec-grid">
          <SectionRow label="Horizontal" st={s.sections.y} min={b.min.y - 0.5} max={b.max.y + 0.5} fmtV={(v) => kote(v) + ' m'} onChange={(p) => sec('y', p)}>
            {storeys.map((l) => (
              <button key={l.key} type="button" className="chip ghost tiny" title={`Grundriss-Schnitt ${l.name} (+1,20 m über OKFF)`} onClick={() => sec('y', { enabled: true, value: +(l.elevation + 1.2).toFixed(2), flip: false })}>{l.short}</button>
            ))}
          </SectionRow>
          <SectionRow label="Längsschnitt X" st={s.sections.x} min={b.min.x - 0.5} max={b.max.x + 0.5} fmtV={(v) => fmt(v - b.min.x) + ' m'} onChange={(p) => sec('x', p)} />
          <SectionRow label="Querschnitt Z" st={s.sections.z} min={b.min.z - 0.5} max={b.max.z + 0.5} fmtV={(v) => fmt(v - b.min.z) + ' m'} onChange={(p) => sec('z', p)} />
        </div>
      </div>
    </footer>
  );
}

function SectionRow(props: { label: string; st: SectionState; min: number; max: number; fmtV: (v: number) => string; onChange: (p: Partial<SectionState>) => void; children?: React.ReactNode }) {
  const { st } = props;
  return (
    <div className={'sec-row' + (st.enabled ? ' on' : '')}>
      <label className="check"><input type="checkbox" checked={st.enabled} onChange={(e) => props.onChange({ enabled: e.target.checked })} /> {props.label}</label>
      <input type="range" min={props.min} max={props.max} step={0.01} value={Math.min(props.max, Math.max(props.min, st.value))} aria-label={props.label}
        onChange={(e) => props.onChange({ value: Number(e.target.value), enabled: true })} />
      <output>{props.fmtV(st.value)}</output>
      <button type="button" className={'mini' + (st.flip ? ' on' : '')} title="Blickrichtung umkehren" aria-label="Schnittrichtung umkehren" aria-pressed={st.flip} onClick={() => props.onChange({ flip: !st.flip, enabled: true })}><FlipHorizontal2 size={14} /></button>
      {props.children && <div className="sec-quick">{props.children}</div>}
    </div>
  );
}
