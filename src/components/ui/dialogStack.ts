/**
 * Modal / Sheet 共用的对话框栈。
 *
 * Escape 与 Tab 焦点陷阱都挂在 document 上，多个对话框同时打开时（例如 Sheet 里再弹出
 * 确认框）只应由最上层的那个响应，否则一次 Escape 会把所有层一起关掉。
 */

const stack: string[] = [];

export function pushDialog(id: string): void {
  removeDialog(id);
  stack.push(id);
}

export function removeDialog(id: string): void {
  const index = stack.lastIndexOf(id);
  if (index >= 0) stack.splice(index, 1);
}

export function isTopDialog(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

export function getDialogDepth(): number {
  return stack.length;
}

/**
 * 初始焦点：优先显式标记的 [data-autofocus]，其次是内容区里第一个可聚焦元素，
 * 最后才是关闭按钮。关闭按钮在 DOM 中排在最前，直接取 [0] 会让每个表单都先聚焦到 X。
 */
export function pickInitialFocus<T>(
  focusables: readonly T[],
  closeButton: T | null,
  isAutofocus: (element: T) => boolean = () => false
): T | null {
  const marked = focusables.find(isAutofocus);
  if (marked) return marked;
  const content = focusables.find((element) => element !== closeButton);
  return content ?? closeButton ?? focusables[0] ?? null;
}
