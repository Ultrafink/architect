import { create } from 'zustand';
import type { ModelScene, RenderMode } from './model/ModelScene';

export type Tool = 'select' | 'measure';
export type DayPreset = 'morgen' | 'mittag' | 'abend' | 'nacht';
export type ToneMap = 'aces' | 'agx' | 'neutral';

export interface SectionState {
  enabled: boolean;
  value: number; // metres in world coords
  flip: boolean;
}

export interface Measurement {
  id: string;
  a: [number, number, number];
  b: [number, number, number];
}

export interface SavedView {
  id: string;
  name: string;
  ortho: boolean;
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
}

interface Toast { id: number; text: string; kind: 'info' | 'error' }

export interface AppState {
  model: ModelScene | null;
  loading: { active: boolean; progress: number; stage: string };
  error: string | null;
  version: number; // bump when model structure changes (tree refresh)

  tool: Tool;
  mode: RenderMode;
  ortho: boolean;
  selected: string[];
  isolated: string[] | null;
  hiddenCount: number;
  search: string;

  levelVisible: Record<string, boolean>;
  explode: number;
  explodeSpacing: number;

  sections: { y: SectionState; x: SectionState; z: SectionState };
  caps: boolean;
  capColor: string;

  preset: DayPreset;
  hour: number;
  month: number;
  north: number; // degrees model north offset
  sunIntensity: number;
  envIntensity: number;
  exposure: number;
  colorTemp: number; // Kelvin
  toneMap: ToneMap;
  shadows: boolean;
  shadowSoftness: number;
  showBackground: boolean;

  measurements: Measurement[];
  views: SavedView[];
  leftOpen: boolean;
  rightOpen: boolean;
  toasts: Toast[];

  set: (p: Partial<AppState>) => void;
  toast: (text: string, kind?: 'info' | 'error') => void;
}

const savedViews = (): SavedView[] => {
  try { return JSON.parse(localStorage.getItem('a3d.views') || '[]'); } catch { return []; }
};

const wide = typeof window !== 'undefined' ? window.innerWidth >= 1100 : true;

export const useApp = create<AppState>((set, get) => ({
  model: null,
  loading: { active: false, progress: 0, stage: '' },
  error: null,
  version: 0,
  tool: 'select',
  mode: 'realistic',
  ortho: false,
  selected: [],
  isolated: null,
  hiddenCount: 0,
  search: '',
  levelVisible: {},
  explode: 0,
  explodeSpacing: 4,
  sections: {
    y: { enabled: false, value: 1.2, flip: false },
    x: { enabled: false, value: 0, flip: false },
    z: { enabled: false, value: 0, flip: false },
  },
  caps: true,
  capColor: '#7a2f2a',
  preset: 'mittag',
  hour: 13,
  month: 6,
  north: 0,
  sunIntensity: 3,
  envIntensity: 0.9,
  exposure: 1,
  colorTemp: 5600,
  toneMap: 'agx',
  shadows: true,
  shadowSoftness: 3,
  showBackground: true,
  measurements: [],
  views: savedViews(),
  leftOpen: wide,
  rightOpen: wide,
  toasts: [],
  set: (p) => set(p),
  toast: (text, kind = 'info') => {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 7000 : 3500);
  },
}));

export const persistViews = (v: SavedView[]) => {
  try { localStorage.setItem('a3d.views', JSON.stringify(v)); } catch { /* storage unavailable */ }
};
