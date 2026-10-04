export type WakeLockStatus = 'unsupported' | 'off' | 'idle' | 'requesting' | 'active' | 'failed' | 'released';
export interface WakeLockHandle {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}
export interface WakeLockAPI { request(type: 'screen'): Promise<WakeLockHandle> }

export class WakeLockController {
  private enabled = true;
  private needed = false;
  private visible = true;
  private disposed = false;
  private blocked: 'failed' | 'released' | null = null;
  private generation = 0;
  private busy = false;
  private handle: WakeLockHandle | null = null;
  private current: WakeLockStatus = 'idle';
  constructor(private api: WakeLockAPI | undefined, private notify: (status: WakeLockStatus) => void) {}
  private wantsLock() { return this.enabled && this.needed && this.visible && !this.disposed; }
  private report(status: WakeLockStatus) {
    this.current = status;
    if (!this.disposed) this.notify(status);
  }
  update(enabled: boolean, needed: boolean, visible: boolean) {
    const before = this.wantsLock();
    this.enabled = enabled; this.needed = needed; this.visible = visible;
    if (before !== this.wantsLock()) { this.generation++; this.blocked = null; }
    void this.pump();
  }
  retry() { this.blocked = null; void this.pump(); }
  dispose() { this.disposed = true; this.generation++; void this.pump(); }
  private onRelease = () => {
    if (!this.handle) return;
    this.handle.removeEventListener('release', this.onRelease);
    this.handle = null;
    this.blocked = 'released';
    if (this.wantsLock()) this.report('released');
    else void this.pump();
  };
  private async release(handle: WakeLockHandle) {
    handle.removeEventListener('release', this.onRelease);
    try { await handle.release(); }
    catch (error) { console.warn('Screen wake lock release failed', error); }
  }
  private async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (true) {
        if (this.handle && !this.wantsLock()) {
          const handle = this.handle; this.handle = null;
          await this.release(handle); continue;
        }
        if (!this.api) { this.report('unsupported'); return; }
        if (!this.wantsLock()) { this.report(this.enabled ? 'idle' : 'off'); return; }
        if (this.handle) { this.report('active'); return; }
        if (this.blocked) { this.report(this.blocked); return; }
        const generation = this.generation;
        this.report('requesting');
        let handle: WakeLockHandle;
        try { handle = await this.api.request('screen'); }
        catch (error) {
          console.warn('Screen wake lock request failed', error);
          if (generation !== this.generation) continue;
          this.blocked = 'failed'; this.report('failed'); return;
        }
        if (generation !== this.generation || !this.wantsLock()) { await this.release(handle); continue; }
        if (handle.released) { this.blocked = 'released'; this.report('released'); return; }
        this.handle = handle;
        handle.addEventListener('release', this.onRelease);
        this.report('active'); return;
      }
    } finally { this.busy = false; }
  }
}
