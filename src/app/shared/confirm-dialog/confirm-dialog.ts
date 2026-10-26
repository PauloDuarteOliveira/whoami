import { Component, ElementRef, HostListener, effect, inject, viewChild } from '@angular/core';
import { ConfirmService } from '../../core/confirm.service';
import { DialogIcon } from '../dialog-icon/dialog-icon';
import { trapFocus } from '../focus';

/**
 * The confirmation box (design canvas, section 6). It follows the Day / Night theme, says what will happen,
 * and repeats the action on its button. Esc, a click outside, or Cancel answers no.
 */
@Component({
    selector: 'app-confirm-dialog',
    imports: [DialogIcon],
    template: `
    @if (confirm.request(); as r) {
      <div class="dialog-layer">
        <button type="button" class="dialog-backdrop" tabindex="-1" aria-label="Cancel" (click)="r.answer(false)"></button>
        <section #box class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
          <div class="dialog-head">
            <span class="dialog-badge" [class]="'dialog-badge ' + (r.tone ?? 'normal')"><app-dialog-icon [name]="r.icon ?? 'warn'" /></span>
            <h2 id="confirm-title">{{ r.title }}</h2>
          </div>
          <p id="confirm-text" class="dialog-text">{{ r.text }}</p>
          @if (r.card; as card) {
            <div class="dialog-card">
              @if (card.avatar; as a) { <span class="avatar-dot" [style.background]="a.color">{{ a.letter }}</span> }
              <div class="who"><div class="card-label">{{ card.label }}</div><div class="card-name">{{ card.name }}</div></div>
            </div>
          }
          @if (r.note) {
            <div class="dialog-note" [class]="'dialog-note ' + (r.tone === 'danger' ? 'danger' : 'warn')">{{ r.note }}</div>
          }
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" data-cancel (click)="r.answer(false)">{{ r.cancelLabel ?? 'Cancel' }}</button>
            <button type="button" class="btn" data-confirm [class.btn-destructive]="r.tone === 'danger'"
              [class.btn-primary]="r.tone !== 'danger'" (click)="r.answer(true)">{{ r.confirmLabel }}</button>
          </div>
          <span class="dialog-foot hint">Esc, or a click outside, cancels</span>
        </section>
      </div>
    }
  `,
})
export class ConfirmDialog {
    protected readonly confirm = inject(ConfirmService);
    private readonly box = viewChild<ElementRef<HTMLElement>>('box');
    private returnFocus: HTMLElement | null = null;

    constructor() {
        // When a box opens, focus starts on Cancel for red actions (so Enter can't kick someone by accident),
        // and on the confirm button otherwise. When it closes, focus goes back where it was.
        effect(() => {
            const box = this.box()?.nativeElement;
            const request = this.confirm.request();
            if (box && request) {
                this.returnFocus ??= document.activeElement as HTMLElement | null;
                box.querySelector<HTMLElement>(request.tone === 'danger' ? '[data-cancel]' : '[data-confirm]')?.focus();
            } else if (!request && this.returnFocus) {
                this.returnFocus.focus?.();
                this.returnFocus = null;
            }
        });
    }

    @HostListener('document:keydown', ['$event'])
    protected onKey(event: KeyboardEvent): void {
        const request = this.confirm.request();
        const box = this.box()?.nativeElement;
        if (!request || !box) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            request.answer(false);
        } else if (event.key === 'Tab') {
            trapFocus(box, event);
        }
    }
}
