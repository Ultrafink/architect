import { Component, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import { useApp } from './store';
import Viewer from './viewer/Viewer';
import Toolbar from './ui/Toolbar';
import StructurePanel from './ui/StructurePanel';
import DisplayPanel from './ui/DisplayPanel';
import BottomBar from './ui/BottomBar';
import { DEFAULT_MODEL, loadModel } from './model/loader';

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() {
    if (this.state.err) {
      return (
        <div className="fatal">
          <AlertTriangle size={28} />
          <h2>Die 3D-Ansicht wurde beendet</h2>
          <p>{this.state.err}</p>
          <p>Häufige Ursache: WebGL ist deaktiviert oder der Grafikspeicher reicht nicht. Seite neu laden oder die Hardwarebeschleunigung des Browsers aktivieren.</p>
          <button type="button" className="btn" onClick={() => location.reload()}>Neu laden</button>
        </div>
      );
    }
    return this.props.children;
  }
}

let booted = false;

export default function App() {
  const s = useApp();
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (booted) return;
    booted = true;
    loadModel({ url: DEFAULT_MODEL, name: decodeURIComponent(DEFAULT_MODEL.split('/').pop()!) });
  }, []);

  return (
    <div
      className={'app' + (s.leftOpen ? ' l-open' : '') + (s.rightOpen ? ' r-open' : '') + (s.tool === 'measure' ? ' measuring' : '')}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) loadModel(f); }}
    >
      <Toolbar />
      {s.leftOpen && <StructurePanel />}
      <main className="viewport">
        <Boundary><Viewer /></Boundary>
        {s.tool === 'measure' && <div className="tool-hint">Messen: zwei Punkte anklicken · Esc bricht ab</div>}
        {s.isolated && <div className="tool-hint top">Isolierte Ansicht ({s.isolated.length}) · <button type="button" className="link" onClick={() => s.set({ isolated: null })}>Beenden</button></div>}
        {s.loading.active && (
          <div className="overlay">
            <div className="loadbox">
              <strong>{s.loading.stage}</strong>
              <div className="bar"><i style={{ width: `${Math.round(s.loading.progress * 100)}%` }} /></div>
              <span>{Math.round(s.loading.progress * 100)} %</span>
            </div>
          </div>
        )}
        {s.error && (
          <div className="overlay">
            <div className="loadbox error">
              <AlertTriangle size={22} />
              <strong>{s.error}</strong>
              <span>Liegt die Datei unter <code>public/models/</code>? Alternativ eine FBX/GLB-Datei hierher ziehen.</span>
              <button type="button" className="btn" onClick={() => s.set({ error: null })}>Schließen</button>
            </div>
          </div>
        )}
        {drag && <div className="overlay drop"><Upload size={32} /><strong>FBX oder GLB hier ablegen</strong></div>}
      </main>
      {s.rightOpen && <DisplayPanel />}
      <BottomBar />
      <div className="toasts" role="status" aria-live="polite">
        {s.toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}
      </div>
    </div>
  );
}
