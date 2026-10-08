import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// There is no DOM test harness, so these guard the structure of a bug that was only found in a
// real browser: confirming "discard changes" closed the confirm dialog, which re-rendered the
// parent, which re-ran the open/close effect while `open` was still true and cancelled the
// pending close timer — the sheet the user had just agreed to close sprang back open.
describe.each([
  ['Sheet', 'src/components/ui/Sheet/Sheet.tsx'],
  ['Modal', 'src/components/ui/Modal.tsx'],
])('%s close animation', (_name, path) => {
  const source = read(path);

  test('remembers a user-initiated close while the animation runs', () => {
    expect(source).toContain('const userClosingRef = useRef(false);');
    expect(source).toContain('if (notifyParent) userClosingRef.current = true;');
    expect(source).toContain('userClosingRef.current = false;');
  });

  test('does not cancel a pending close when the open effect re-runs', () => {
    const effect = source.slice(source.indexOf('if (open) {'));
    expect(effect.indexOf('if (userClosingRef.current) return;')).toBeGreaterThan(-1);
    expect(effect.indexOf('if (userClosingRef.current) return;')).toBeLessThan(
      effect.indexOf('window.clearTimeout(closeTimerRef.current)')
    );
  });

  test('uses the shared dialog behaviour so only the top dialog handles Escape', () => {
    expect(source).toContain('useDialogBehavior(');
  });
});
