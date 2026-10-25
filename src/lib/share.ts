export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch { return false; }
}

export type ShareOutcome = 'shared' | 'unavailable' | 'dismissed';

export async function shareContent(title: string, text: string): Promise<ShareOutcome> {
  if (!navigator.share) return 'unavailable';
  try {
    await navigator.share({ title, text });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'dismissed';
    return 'unavailable';
  }
}
