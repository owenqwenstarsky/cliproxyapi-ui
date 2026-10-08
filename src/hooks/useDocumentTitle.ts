import { useEffect } from 'react';

/** 同步浏览器标签页标题，使不同页面在标签页与历史记录里可区分。 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    window.document.title = title;
  }, [title]);
}
