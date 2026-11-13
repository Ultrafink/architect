import type { ReactNode } from 'react';
import { useApp } from '../store';
import { api } from '../viewer/api';

export function IconButton(props: {
  icon: ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean; shortcut?: string; showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      className={'ibtn' + (props.active ? ' on' : '') + (props.showLabel ? ' withlabel' : '')}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label + (props.shortcut ? ` (${props.shortcut})` : '')}
      aria-label={props.label}
      aria-pressed={props.active}
    >
      {props.icon}
      {props.showLabel && <span>{props.label}</span>}
    </button>
  );
}

export function Slider(props: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
  format?: (v: number) => string; disabled?: boolean;
}) {
  return (
    <label className={'slider' + (props.disabled ? ' disabled' : '')}>
      <span className="slider-head">
        <span>{props.label}</span>
        <output>{props.format ? props.format(props.value) : props.value}</output>
      </span>
      <input
        type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={props.value === o.value} className={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Section(props: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="psection">
      <header>
        <h3>{props.title}</h3>
        {props.aside}
      </header>
      {props.children}
    </section>
  );
}

/* ---------------------------------------------------------------- element actions */

export const actions = {
  hideSelected() {
    const s = useApp.getState();
    if (!s.model || !s.selected.length) return;
    s.selected.forEach((id) => { const el = s.model!.elements.get(id); if (el) el.hidden = true; });
    s.set({ selected: [], hiddenCount: s.hiddenCount + s.selected.length });
  },
  isolateSelected() {
    const s = useApp.getState();
    if (!s.model || !s.selected.length) return;
    s.set({ isolated: [...s.selected] });
    api.fit(s.model.elementBox(s.selected).expandByScalar(2));
  },
  showAll() {
    const s = useApp.getState();
    if (!s.model) return;
    s.model.elements.forEach((el) => (el.hidden = false));
    const lv: Record<string, boolean> = {};
    s.model.levels.forEach((l) => (lv[l.key] = true));
    s.set({ isolated: null, hiddenCount: 0, levelVisible: lv });
  },
  resetAll() {
    const s = useApp.getState();
    if (!s.model) return;
    actions.showAll();
    s.set({
      selected: [], explode: 0, mode: 'realistic',
      sections: {
        y: { ...s.sections.y, enabled: false, flip: false },
        x: { ...s.sections.x, enabled: false, flip: false },
        z: { ...s.sections.z, enabled: false, flip: false },
      },
    });
    api.standardView('iso');
  },
};
