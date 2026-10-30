export function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
    const focusable = Array.from(
        container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    } else if (!container.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
    }
}
