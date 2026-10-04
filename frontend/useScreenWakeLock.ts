import { useEffect, useRef, useState } from 'react';
import { WakeLockController, WakeLockAPI, WakeLockStatus } from './wakeLockController';

export function useScreenWakeLock(needed: boolean, storageKey: string) {
  const [enabled, setEnabledState] = useState(() => {
    try { return localStorage.getItem(storageKey) !== 'off'; }
    catch (error) { console.warn('Screen wake lock preference could not be read', error); return true; }
  });
  const [status, setStatus] = useState<WakeLockStatus>('idle');
  const controller = useRef<WakeLockController | null>(null);
  const inputs = useRef({ enabled, needed });
  inputs.current = { enabled, needed };
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockAPI }).wakeLock;
    const instance = new WakeLockController(api, setStatus);
    controller.current = instance;
    const sync = () => instance.update(inputs.current.enabled, inputs.current.needed, document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      document.removeEventListener('visibilitychange', sync);
      controller.current = null;
      instance.dispose();
    };
  }, []);
  useEffect(() => {
    controller.current?.update(enabled, needed, document.visibilityState === 'visible');
  }, [enabled, needed]);
  const setEnabled = (value: boolean) => {
    setEnabledState(value);
    try { localStorage.setItem(storageKey, value ? 'on' : 'off'); }
    catch (error) { console.warn('Screen wake lock preference could not be saved', error); }
  };
  return { enabled, status, setEnabled, retry: () => controller.current?.retry() };
}
