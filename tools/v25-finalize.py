from pathlib import Path
import shutil


def replace_once(path, old, new, label):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    if old not in s:
        raise RuntimeError(f'{label} anchor missing')
    p.write_text(s.replace(old, new, 1), encoding='utf-8')


replace_once(
    'followup-background.js',
    "    const groups = allGroups.slice(0, cfg.followUpMaxSitesPerRun);",
    "    const groups = globalThis.OfferTrackFollowUpQueue?.selectGroups\n      ? globalThis.OfferTrackFollowUpQueue.selectGroups(allGroups, cfg, source)\n      : allGroups.slice(0, cfg.followUpMaxSitesPerRun);",
    'queue selection'
)
replace_once(
    'followup-background.js',
    "    for (const group of groups) {\n      const inspected = await inspectGroup(group, cfg, source).catch(err => ({ host: group.host, provider: group.provider, status: 'error', error: err?.message || String(err), records: [], page: null }));",
    "    for (const group of groups) {\n      await globalThis.OfferTrackFollowUpQueue?.markRunning?.(group, source).catch(() => null);\n      const inspected = await inspectGroup(group, cfg, source).catch(err => ({ host: group.host, provider: group.provider, status: 'error', error: err?.message || String(err), records: [], page: null }));",
    'queue mark running'
)
replace_once(
    'followup-background.js',
    "      for (const k of ['checked','changed','failed','loginRequired','sessionBlocked','waiting','unmatched']) result[k] += patchResult[k] || 0;\n      if (patchResult.detail) result.details.push(patchResult.detail);\n      await sleep(250);",
    "      for (const k of ['checked','changed','failed','loginRequired','sessionBlocked','waiting','unmatched']) result[k] += patchResult[k] || 0;\n      if (patchResult.detail) result.details.push(patchResult.detail);\n      await globalThis.OfferTrackFollowUpQueue?.completeGroup?.(group, inspected, patchResult).catch(() => null);\n      await sleep(250);",
    'queue complete'
)
replace_once(
    'followup-background.js',
    "    result.message = `自动跟进完成：检查 ${result.checked} 条，状态变化 ${result.changed}，待登录 ${result.loginRequired}，需验证/受限 ${result.sessionBlocked}，失败 ${result.failed}`;\n    await chrome.storage.local.set({ lastFollowUp: result });",
    "    result.message = `自动跟进完成：检查 ${result.checked} 条，状态变化 ${result.changed}，待登录 ${result.loginRequired}，需验证/受限 ${result.sessionBlocked}，失败 ${result.failed}`;\n    await globalThis.OfferTrackChangeJournal?.appendFromResult?.(result).catch(() => []);\n    await chrome.storage.local.set({ lastFollowUp: result });",
    'change journal'
)
replace_once(
    'followup-background.js',
    "      } catch (e) {\n        const failState = { source, at: Date.now(), ok: false, message: friendlyError(e), checked: 0, changed: 0, failed: 1 };",
    "      } catch (e) {\n        globalThis.OfferTrackChangeJournal?.clearRecentMatches?.();\n        const failState = { source, at: Date.now(), ok: false, message: friendlyError(e), checked: 0, changed: 0, failed: 1 };",
    'journal cleanup'
)

old_route = """    routeTimer = setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        lastDetected = routeLooksRelevant();
        runtimeConfigCache = null;
        try { globalThis.__offerTrackInvalidateSemanticCache?.(); } catch {}
        scheduleAutoScan(350);
        setTimeout(() => scheduleAutoScan(0), 2600);
      }
    }, 1500);"""
new_route = """    const onRouteSignal = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      lastDetected = routeLooksRelevant();
      runtimeConfigCache = null;
      try { globalThis.__offerTrackInvalidateSemanticCache?.(); } catch {}
      scheduleAutoScan(350);
      setTimeout(() => scheduleAutoScan(0), 2600);
    };
    window.addEventListener('hashchange', onRouteSignal, { passive: true });
    window.addEventListener('popstate', onRouteSignal, { passive: true });
    window.addEventListener('pageshow', onRouteSignal, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) onRouteSignal();
    }, { passive: true });"""
replace_once('content.js', old_route, new_route, 'event-driven route handling')

for rel in [
    '.github/workflows/bootstrap-v25.yml',
    '.github/workflows/v25-integrate-retry.yml',
    '.github/workflows/v25-finalize.yml',
    '.github/workflows/v25-apply.yml',
    '.github/workflows/publish-v240.yml',
    '.github/workflows/publish-v240-final.yml',
    'INSTALL_EDGE.bat', 'PROVIDER_REGISTRY.md', 'SESSION_MANAGER.md', 'TEST_REPORT.md', 'V2_ROADMAP.md',
    'tools/apply-v240.py', 'tools/apply-v240b.py',
    'tools/v25-finalize.py'
]:
    p = Path(rel)
    if p.exists():
        p.unlink()

payload = Path('tools/v240-payload')
if payload.exists():
    shutil.rmtree(payload)
tools = Path('tools')
if tools.exists() and not any(tools.iterdir()):
    tools.rmdir()

print('v2.5 integration patch applied')
