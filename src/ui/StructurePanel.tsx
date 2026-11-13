import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { ChevronRight, Eye, EyeOff, Search, X, Crosshair, Info } from 'lucide-react';
import { useApp } from '../store';
import { api } from '../viewer/api';
import { saveManualLevels } from '../model/loader';
import type { BimElement } from '../model/ModelScene';
import { fmt } from '../viewer/Viewer';

export const kote = (y: number) => (y >= 0.005 ? '+' : y <= -0.005 ? '−' : '±') + fmt(Math.abs(y));

export default function StructurePanel() {
  const s = useApp();
  const m = s.model;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const q = s.search.trim().toLowerCase();

  const tree = useMemo(() => {
    if (!m) return [];
    return m.levels.map((lv) => {
      const cats = new Map<string, BimElement[]>();
      m.elements.forEach((el) => {
        if (el.level !== lv.key) return;
        if (!cats.has(el.category)) cats.set(el.category, []);
        cats.get(el.category)!.push(el);
      });
      const list = [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([c, els]) => ({ c, els: els.sort((a, b) => a.name.localeCompare(b.name, 'de')) }));
      return { lv, list, count: list.reduce((n, x) => n + x.els.length, 0) };
    });
  }, [m, s.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    if (!m || q.length < 2) return [];
    const out: BimElement[] = [];
    m.elements.forEach((el) => {
      if (el.name.toLowerCase().includes(q) || el.category.toLowerCase().includes(q) || el.revitId === q || el.materialNames.some((n) => n.toLowerCase().includes(q))) out.push(el);
    });
    return out.slice(0, 400);
  }, [m, q]);

  if (!m) return <aside className="panel left"><div className="empty">Kein Modell geladen.</div></aside>;

  const select = (id: string, e: React.MouseEvent) => {
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    s.set({ selected: add ? (s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id]) : [id] });
  };
  const toggleEl = (el: BimElement) => {
    el.hidden = !el.hidden;
    s.set({ hiddenCount: s.hiddenCount + (el.hidden ? 1 : -1) });
  };
  const toggleCat = (els: BimElement[]) => {
    const hide = els.some((e) => !e.hidden);
    els.forEach((e) => (e.hidden = hide));
    s.set({ hiddenCount: s.hiddenCount + (hide ? els.length : -els.length) });
  };
  const zoomTo = (ids: string[]) => api.fit(m.elementBox(ids).expandByScalar(1.5));

  const Row = ({ el }: { el: BimElement }) => (
    <div className={'row el' + (s.selected.includes(el.id) ? ' sel' : '') + (el.hidden ? ' dim' : '')} onClick={(e) => select(el.id, e)} onDoubleClick={() => zoomTo([el.id])} title={el.name}>
      <span className="name">{el.name}</span>
      <button type="button" className="mini" aria-label={el.hidden ? 'Einblenden' : 'Ausblenden'} onClick={(e) => { e.stopPropagation(); toggleEl(el); }}>
        {el.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );

  return (
    <aside className="panel left" aria-label="Gebäudestruktur">
      <div className="panel-title">
        <h2>Gebäudestruktur</h2>
        <span className="count">{m.info.elementCount.toLocaleString('de-DE')} Elemente</span>
      </div>
      <div className="search">
        <Search size={15} />
        <input placeholder="Suchen: Name, Kategorie, Material, Revit-ID" value={s.search} onChange={(e) => s.set({ search: e.target.value })} />
        {s.search && <button type="button" className="mini" aria-label="Suche leeren" onClick={() => s.set({ search: '' })}><X size={14} /></button>}
      </div>

      <div className="tree" role="tree">
        {q.length >= 2 ? (
          <>
            <div className="tree-hint">
              {results.length ? `${results.length}${results.length === 400 ? '+' : ''} Treffer` : 'Keine Treffer. Andere Schreibweise oder Revit-ID versuchen.'}
              {results.length > 0 && (
                <button type="button" className="link" onClick={() => { s.set({ selected: results.map((r) => r.id) }); zoomTo(results.map((r) => r.id)); }}>Alle auswählen</button>
              )}
            </div>
            {results.map((el) => <Row key={el.id} el={el} />)}
          </>
        ) : (
          tree.map(({ lv, list, count }) => {
            const ko = open[lv.key] ?? false;
            const vis = s.levelVisible[lv.key] !== false;
            return (
              <div key={lv.key} className="node">
                <div className={'row lvl' + (vis ? '' : ' dim')} onClick={() => setOpen({ ...open, [lv.key]: !ko })}>
                  <ChevronRight size={14} className={'chev' + (ko ? ' open' : '')} />
                  <span className="name">{lv.name}</span>
                  {lv.kind === 'storey' && <span className="kote">{kote(lv.elevation)}</span>}
                  <span className="count">{count}</span>
                  <button type="button" className="mini" aria-label={vis ? 'Geschoss ausblenden' : 'Geschoss einblenden'} onClick={(e) => { e.stopPropagation(); s.set({ levelVisible: { ...s.levelVisible, [lv.key]: !vis } }); }}>
                    {vis ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
                {ko && list.map(({ c, els }) => {
                  const ck = lv.key + '/' + c;
                  const co = open[ck] ?? false;
                  const allHidden = els.every((e) => e.hidden);
                  return (
                    <div key={ck} className="node sub">
                      <div className={'row cat' + (allHidden ? ' dim' : '')} onClick={() => setOpen({ ...open, [ck]: !co })}>
                        <ChevronRight size={13} className={'chev' + (co ? ' open' : '')} />
                        <span className="name">{c}</span>
                        <span className="count">{els.length}</span>
                        <button type="button" className="mini" aria-label="Kategorie auswählen" title="Kategorie auswählen" onClick={(e) => { e.stopPropagation(); s.set({ selected: els.map((x) => x.id) }); }}>
                          <Crosshair size={13} />
                        </button>
                        <button type="button" className="mini" aria-label={allHidden ? 'Kategorie einblenden' : 'Kategorie ausblenden'} onClick={(e) => { e.stopPropagation(); toggleCat(els); }}>
                          {allHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      {co && <div className="leafs">{els.map((el) => <Row key={el.id} el={el} />)}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      <SelectionInfo />
    </aside>
  );
}

function SelectionInfo() {
  const s = useApp();
  const m = s.model!;
  const [target, setTarget] = useState('');
  const sel = s.selected.map((id) => m.elements.get(id)).filter(Boolean) as BimElement[];
  if (!sel.length) {
    return (
      <div className="selinfo empty-sel">
        <Info size={14} />
        <span>Element im Modell oder in der Liste anklicken. Umschalt/Strg-Klick für Mehrfachauswahl, Doppelklick zoomt.</span>
      </div>
    );
  }
  const el = sel[0];
  const size = m.elementBox(s.selected).getSize(new THREE.Vector3());
  const lvName = (k: string) => m.levels.find((l) => l.key === k)?.name ?? k;
  const assign = () => {
    const k = target || m.levels[0].key;
    sel.forEach((e) => m.setLevel(e.id, k));
    saveManualLevels(m);
    s.set({ version: s.version + 1 });
    s.toast(`${sel.length} Element(e) → ${lvName(k)} zugeordnet.`);
  };
  const resetAuto = () => {
    sel.forEach((e) => m.setLevel(e.id, e.autoLevel));
    saveManualLevels(m);
    s.set({ version: s.version + 1 });
  };
  const levelHint = el.params['Abhängigkeit unten'] || el.params['Basisebene'] || el.params['Ebene'] || el.params['Level'] || el.params['Referenzebene'];

  return (
    <div className="selinfo">
      <div className="sel-head">
        <strong title={el.name}>{sel.length > 1 ? `${sel.length} Elemente ausgewählt` : el.name}</strong>
        <button type="button" className="mini" aria-label="Auswahl aufheben" onClick={() => s.set({ selected: [] })}><X size={14} /></button>
      </div>
      <dl>
        {sel.length === 1 && <><dt>Kategorie</dt><dd>{el.category}</dd></>}
        {sel.length === 1 && el.revitId && <><dt>Revit-ID</dt><dd>{el.revitId}</dd></>}
        <dt>Geschoss</dt><dd>{[...new Set(sel.map((e) => lvName(e.level)))].join(', ')}{sel.some((e) => e.level !== e.autoLevel) ? ' (manuell)' : ''}</dd>
        {sel.length === 1 && levelHint && <><dt>Revit-Ebene</dt><dd>{levelHint}</dd></>}
        <dt>Abmessung</dt><dd>{fmt(size.x)} × {fmt(size.z)} × {fmt(size.y)} m</dd>
        {sel.length === 1 && el.materialNames.length > 0 && <><dt>Materialien</dt><dd>{el.materialNames.map((n) => n || 'ohne Namen').join(', ')}</dd></>}
      </dl>
      <div className="assign">
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Geschoss für Zuordnung">
          <option value="">Geschoss zuordnen …</option>
          {m.levels.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
        </select>
        <button type="button" className="btn" onClick={assign} disabled={!target}>Zuordnen</button>
        {sel.some((e) => e.level !== e.autoLevel) && <button type="button" className="btn ghost" onClick={resetAuto}>Automatisch</button>}
      </div>
    </div>
  );
}
