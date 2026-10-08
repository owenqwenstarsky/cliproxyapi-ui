import { beforeEach, describe, expect, test } from 'bun:test';
import {
  getDialogDepth,
  isTopDialog,
  pickInitialFocus,
  pushDialog,
  removeDialog,
} from '@/components/ui/dialogStack';

describe('dialog stack', () => {
  beforeEach(() => {
    while (getDialogDepth() > 0) {
      removeDialog('a');
      removeDialog('b');
      removeDialog('c');
    }
  });

  test('only the most recently opened dialog is on top', () => {
    pushDialog('a');
    pushDialog('b');
    expect(isTopDialog('b')).toBe(true);
    expect(isTopDialog('a')).toBe(false);
  });

  test('closing the top dialog hands control back to the one beneath', () => {
    pushDialog('a');
    pushDialog('b');
    removeDialog('b');
    expect(isTopDialog('a')).toBe(true);
  });

  test('closing a lower dialog does not steal the top spot', () => {
    pushDialog('a');
    pushDialog('b');
    removeDialog('a');
    expect(isTopDialog('b')).toBe(true);
    expect(getDialogDepth()).toBe(1);
  });

  test('re-pushing an id moves it to the top without duplicating it', () => {
    pushDialog('a');
    pushDialog('b');
    pushDialog('a');
    expect(isTopDialog('a')).toBe(true);
    expect(getDialogDepth()).toBe(2);
  });

  test('an empty stack has no top dialog', () => {
    expect(isTopDialog('a')).toBe(false);
  });
});

describe('initial dialog focus', () => {
  test('skips the close button when content is focusable', () => {
    const close = 'close';
    expect(pickInitialFocus([close, 'name', 'save'], close)).toBe('name');
  });

  test('prefers an explicitly marked element', () => {
    const close = 'close';
    expect(pickInitialFocus([close, 'name', 'cancel'], close, (el) => el === 'cancel')).toBe(
      'cancel'
    );
  });

  test('falls back to the close button when it is the only focusable element', () => {
    expect(pickInitialFocus(['close'], 'close')).toBe('close');
  });

  test('returns null when nothing is focusable', () => {
    expect(pickInitialFocus([], null)).toBeNull();
  });
});
