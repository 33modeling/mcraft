// Main-thread handle to the meshing Web Worker. Falls back gracefully (the
// caller meshes synchronously) when workers are unavailable.

export class MesherPool {
  constructor(uvRects, onResult) {
    this.onResult = onResult;
    this.available = false;
    try {
      this.worker = new Worker(new URL('./mesher.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onResult(e.data);
      this.worker.onerror = (err) => {
        console.error('mesher worker error:', err.message || err);
      };
      this.worker.postMessage({ type: 'init', uvRects });
      this.available = true;
    } catch (e) {
      console.warn('Web Worker unavailable; meshing on the main thread.', e);
      this.available = false;
    }
  }

  // neighbors: [{ dx, dz, blocks: Uint8Array }] (copied via structured clone).
  enqueue(key, cx, cz, neighbors) {
    this.worker.postMessage({ type: 'mesh', key, cx, cz, neighbors });
  }
}
