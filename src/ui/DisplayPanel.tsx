import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Sunrise, Sun, Sunset, Moon, Trash2, Camera, RotateCcw, Box as BoxIcon, PaintBucket, Grid3x3 } from 'lucide-react';
import { useApp, persistViews, type DayPreset } from '../store';
import { api } from '../viewer/api';
import { PRESETS, sunPosition } from '../viewer/sun';
import { fmt } from '../viewer/Viewer';
import { Section, Segmented, Slider } from './controls';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} Uhr`;

export default function DisplayPanel() {
  const s = useApp();
  const m = s.model;
  const sun = useMemo(() => sunPosition(s.month, s.hour, s.north), [s.month, s.hour, s.north]);
  const [viewName, setViewName] = useState('');
  const [, force] = useState(0);
  const [allMats, setAllMats] = useState(false);

  const applyPreset = (p: DayPreset) => s.set({ preset: p, ...PRESETS[p] });

  const mats = useMemo(() => {
    if (!m) return [] as THREE.MeshStandardMaterial[];
    let names: string[];
    if (s.selected.length && !allMats) {
      const set = new Set<string>();
      s.selected.forEach((id) => m.elements.get(id)?.materialNames.forEach((n) => set.add(n)));
      names = [...set];
    } else names = [...m.materials.keys()];
    return names.map((n) => m.materials.get(n)).filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name, 'de')) as THREE.MeshStandardMaterial[];
  }, [m, s.selected, allMats]);

  const saveView = () => {
    const v = { id: String(Date.now()), name: viewName.trim() || `Ansicht ${s.views.length + 1}`, ...api.getView() };
    const views = [...s.views, v];
    s.set({ views });
    persistViews(views);
    setViewName('');
    s.toast(`Ansicht „${v.name}“ gespeichert.`);
  };

  return (
    <aside className="panel right" aria-label="Darstellung">
      <div className="panel-title"><h2>Darstellung</h2></div>
      <div className="panel-scroll">
        <Section title="Modus">
          <Segmented ariaLabel="Darstellungsmodus" value={s.mode} onChange={(v) => s.set({ mode: v })} options={[
            { value: 'realistic', label: 'Realistisch', icon: <BoxIcon size={14} /> },
            { value: 'white', label: 'Weißmodell', icon: <PaintBucket size={14} /> },
            { value: 'wireframe', label: 'Wireframe', icon: <Grid3x3 size={14} /> },
          ]} />
        </Section>

        <Section title="Licht und Tageszeit">
          <div className="presets">
            {([['morgen', 'Morgen', <Sunrise key="a" size={16} />], ['mittag', 'Mittag', <Sun key="b" size={16} />], ['abend', 'Abend', <Sunset key="c" size={16} />], ['nacht', 'Nacht', <Moon key="d" size={16} />]] as const).map(([k, l, ic]) => (
              <button key={k} type="button" className={s.preset === k ? 'on' : ''} onClick={() => applyPreset(k)}>{ic}<span>{l}</span></button>
            ))}
          </div>
          <Slider label="Uhrzeit" value={s.hour} min={4} max={23.75} step={0.25} format={hhmm} onChange={(v) => s.set({ hour: v, preset: v >= 22 || v < 5 ? 'nacht' : v < 11 ? 'morgen' : v < 17.5 ? 'mittag' : 'abend' })} />
          <Slider label="Monat" value={s.month} min={1} max={12} step={1} format={(v) => MONTHS[v - 1]} onChange={(v) => s.set({ month: v })} />
          <Slider label="Nordausrichtung" value={s.north} min={-180} max={180} step={1} format={(v) => `${v}°`} onChange={(v) => s.set({ north: v })} />
          <p className="readout">Sonne: Höhe {sun.elevation.toFixed(1).replace('.', ',')}°, Azimut {sun.azimuth.toFixed(0)}° · Eldagsen 52,2° N</p>
          <Slider label="Sonnenintensität" value={s.sunIntensity} min={0} max={8} step={0.1} format={(v) => v.toFixed(1).replace('.', ',')} onChange={(v) => s.set({ sunIntensity: v })} />
          <Slider label="Farbtemperatur" value={s.colorTemp} min={2000} max={10000} step={100} format={(v) => `${v.toLocaleString('de-DE')} K`} onChange={(v) => s.set({ colorTemp: v })} />
          <Slider label="Umgebungslicht (HDRI)" value={s.envIntensity} min={0} max={3} step={0.05} format={(v) => v.toFixed(2).replace('.', ',')} onChange={(v) => s.set({ envIntensity: v })} />
          <Slider label="Belichtung" value={s.exposure} min={0.2} max={3} step={0.05} format={(v) => v.toFixed(2).replace('.', ',')} onChange={(v) => s.set({ exposure: v })} />
          <label className="field">
            <span>Tone Mapping</span>
            <select value={s.toneMap} onChange={(e) => s.set({ toneMap: e.target.value as typeof s.toneMap })}>
              <option value="agx">AgX (natürlich)</option>
              <option value="aces">ACES Filmic (kontrastreich)</option>
              <option value="neutral">Khronos Neutral (farbtreu)</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={s.shadows} onChange={(e) => s.set({ shadows: e.target.checked })} /> Schatten</label>
          <Slider label="Schattenweichheit" value={s.shadowSoftness} min={0} max={10} step={0.5} disabled={!s.shadows} format={(v) => v.toFixed(1).replace('.', ',')} onChange={(v) => s.set({ shadowSoftness: v })} />
          <label className="check"><input type="checkbox" checked={s.showBackground} onChange={(e) => s.set({ showBackground: e.target.checked })} /> HDRI als Hintergrund</label>
        </Section>

        {m && (
          <Section title={s.selected.length && !allMats ? 'Materialien der Auswahl' : 'Materialien'} aside={s.selected.length ? <button type="button" className="link" onClick={() => setAllMats(!allMats)}>{allMats ? 'Nur Auswahl' : 'Alle'}</button> : undefined}>
            {s.mode !== 'realistic' && <p className="hint">Farbänderungen sind im Modus „Realistisch“ sichtbar.</p>}
            <div className="matlist">
              {mats.map((mat) => (
                <div key={mat.uuid} className="mat">
                  <input type="color" value={'#' + mat.color.getHexString()} aria-label={`Farbe ${mat.name}`} onChange={(e) => { mat.color.set(e.target.value); force((n) => n + 1); api.invalidate(); }} />
                  <span title={mat.name}>{mat.name || 'ohne Namen'}</span>
                  {('#' + mat.color.getHexString()) !== mat.userData.originalColor && (
                    <button type="button" className="mini" aria-label="Originalfarbe" title="Originalfarbe wiederherstellen" onClick={() => { mat.color.set(mat.userData.originalColor); force((n) => n + 1); api.invalidate(); }}><RotateCcw size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Gespeicherte Ansichten">
          <div className="inline">
            <input placeholder="Name der Ansicht" value={viewName} onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveView()} />
            <button type="button" className="btn" onClick={saveView} disabled={!m}><Camera size={14} /> Speichern</button>
          </div>
          {s.views.length === 0 && <p className="hint">Noch keine Ansichten. Kamera einstellen und speichern.</p>}
          {s.views.map((v) => (
            <div key={v.id} className="listrow">
              <button type="button" className="link grow" onClick={() => api.setView(v)}>{v.name}<span className="muted">{v.ortho ? ' · ortho' : ''}</span></button>
              <button type="button" className="mini" aria-label="Ansicht löschen" onClick={() => { const views = s.views.filter((x) => x.id !== v.id); s.set({ views }); persistViews(views); }}><Trash2 size={13} /></button>
            </div>
          ))}
        </Section>

        <Section title="Messungen" aside={s.measurements.length ? <button type="button" className="link" onClick={() => s.set({ measurements: [] })}>Alle löschen</button> : undefined}>
          {s.measurements.length === 0 && <p className="hint">Werkzeug „Messen“ (M) wählen, dann zwei Punkte im Modell anklicken. Eckpunkte rasten ein.</p>}
          {s.measurements.map((mm, i) => {
            const d = new THREE.Vector3(...mm.a).distanceTo(new THREE.Vector3(...mm.b));
            return (
              <div key={mm.id} className="listrow">
                <span className="grow">Strecke {i + 1}</span>
                <strong className="num">{fmt(d)} m</strong>
                <button type="button" className="mini" aria-label="Messung löschen" onClick={() => s.set({ measurements: s.measurements.filter((x) => x.id !== mm.id) })}><Trash2 size={13} /></button>
              </div>
            );
          })}
        </Section>

        {m && (
          <Section title="Modellinformation">
            <dl className="facts">
              <dt>Format</dt><dd>{m.info.format}</dd>
              <dt>Erstellt mit</dt><dd>{m.info.application}</dd>
              <dt>Einheit / Achse</dt><dd>{m.info.unit}, {m.info.upAxis} oben → Meter, Y oben</dd>
              <dt>Abmessung</dt><dd>{fmt(m.buildingBox.getSize(new THREE.Vector3()).x)} × {fmt(m.buildingBox.getSize(new THREE.Vector3()).z)} × {fmt(m.buildingBox.getSize(new THREE.Vector3()).y)} m (Gebäude)</dd>
              <dt>Dreiecke</dt><dd>{m.info.triangles.toLocaleString('de-DE')}</dd>
              <dt>Meshes</dt><dd>{m.info.meshCount.toLocaleString('de-DE')}</dd>
              <dt>Materialien</dt><dd>{m.info.materialCount}</dd>
            </dl>
            {m.info.notes.map((n) => <p key={n} className="hint">{n}</p>)}
          </Section>
        )}
      </div>
    </aside>
  );
}
