import * as THREE from 'three';
import type { SavedView } from '../store';

/** Functions registered by components inside the <Canvas>, callable from the UI. */
export interface ViewerApi {
  fit: (box?: THREE.Box3, dir?: THREE.Vector3) => void;
  standardView: (v: 'iso' | 'top' | 'front' | 'right' | 'back' | 'left') => void;
  getView: () => Omit<SavedView, 'id' | 'name'>;
  setView: (v: Omit<SavedView, 'id' | 'name'>) => void;
  exportPng: (scale: number) => string | null;
  invalidate: () => void;
  rebuildCaps: () => void;
}

const noop = () => {};
export const api: ViewerApi = {
  fit: noop,
  standardView: noop,
  getView: () => ({ ortho: false, position: [0, 0, 0], target: [0, 0, 0], zoom: 1 }),
  setView: noop,
  exportPng: () => null,
  invalidate: noop,
  rebuildCaps: noop,
};

export function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
