(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OfferTrackCredentialStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const LOCAL_KEY = 'feishuCredential';
  const SESSION_KEY = 'feishuCredential';
  let memorySecret = '';

  const clean = v => String(v || '').trim().slice(0, 512);
  const localArea = () => globalThis.chrome?.storage?.local || null;
  const sessionArea = () => globalThis.chrome?.storage?.session || null;

  async function harden() {
    try { await localArea()?.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }); } catch {}
    try { await sessionArea()?.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }); } catch {}
  }

  async function readArea(area, key) {
    if (!area?.get) return null;
    try { return (await area.get([key]))?.[key] || null; } catch { return null; }
  }

  async function writeArea(area, key, value) {
    if (!area?.set) return false;
    try { await area.set({ [key]: value }); return true; } catch { return false; }
  }

  async function removeArea(area, key) {
    try { await area?.remove?.([key]); } catch {}
  }

  async function getSecret() {
    const session = await readArea(sessionArea(), SESSION_KEY);
    const s = clean(session?.secret);
    if (s) return s;
    const local = await readArea(localArea(), LOCAL_KEY);
    const remembered = clean(local?.secret);
    if (remembered) return remembered;
    return memorySecret;
  }

  async function state() {
    const session = await readArea(sessionArea(), SESSION_KEY);
    const local = await readArea(localArea(), LOCAL_KEY);
    const sessionSecret = clean(session?.secret);
    const localSecret = clean(local?.secret);
    return { hasSecret: !!(sessionSecret || localSecret || memorySecret), remembered: !!localSecret };
  }

  async function setSecret(secret, { remember = false } = {}) {
    const value = clean(secret);
    if (!value) return state();
    memorySecret = value;
    await harden();
    await writeArea(sessionArea(), SESSION_KEY, { secret: value, at: Date.now() });
    if (remember) await writeArea(localArea(), LOCAL_KEY, { secret: value, at: Date.now() });
    else await removeArea(localArea(), LOCAL_KEY);
    return state();
  }

  async function setRemember(remember) {
    const secret = await getSecret();
    if (!secret) {
      if (!remember) await removeArea(localArea(), LOCAL_KEY);
      return state();
    }
    if (remember) await writeArea(localArea(), LOCAL_KEY, { secret, at: Date.now() });
    else await removeArea(localArea(), LOCAL_KEY);
    return state();
  }

  async function clear() {
    memorySecret = '';
    await removeArea(sessionArea(), SESSION_KEY);
    await removeArea(localArea(), LOCAL_KEY);
  }

  async function migrateLegacySecret(secret) {
    const value = clean(secret);
    if (!value) return state();
    // Security-first migration: keep the existing secret only for the current browser session,
    // then require explicit opt-in before it is persisted again.
    return setSecret(value, { remember: false });
  }

  return { LOCAL_KEY, SESSION_KEY, harden, getSecret, state, setSecret, setRemember, clear, migrateLegacySecret };
});
