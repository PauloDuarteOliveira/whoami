import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ConfirmService } from '../../core/confirm.service';
import { CHARACTER_MAX, CharacterList, LIST_NAME_MAX, LIST_SIZE_MAX, ListService } from '../../core/list.service';

type LoadState = 'loading' | 'ready' | 'error' | 'missing';

interface Draft {
    id: string | null;
    name: string;
    characters: string[];
}

@Component({
    selector: 'app-list-manager',
    template: `
    <section class="lists card" aria-labelledby="lists-title">
      <div class="head">
        <h2 id="lists-title">Character lists</h2>
        <span class="muted small">Host with your own characters: pick "My lists" in Create room.</span>
      </div>

      @switch (state()) {
        @case ('loading') { <p class="muted">Loading your lists…</p> }
        @case ('missing') { <p class="muted">Character lists aren't switched on yet.</p> }
        @case ('error') { <p class="muted">Couldn't load your lists. <button type="button" class="link" (click)="load()">Try again</button></p> }
        @case ('ready') {
          <div class="body">
            <div class="picker" role="list" aria-label="Your lists">
              @for (l of lists(); track l.id) {
                <button type="button" role="listitem" class="list-card" [class.on]="draft()?.id === l.id" (click)="open(l)">
                  <strong>{{ l.name }}</strong>
                  <span class="small">{{ l.characters.length }} {{ l.characters.length === 1 ? 'character' : 'characters' }}</span>
                </button>
              }
              <button type="button" class="list-card new" [class.on]="draft() && !draft()!.id" (click)="startNew()">+ New list</button>
            </div>

            @if (draft(); as d) {
              <div class="editor">
                <div class="field">
                  <label for="list-name">List name</label>
                  <input id="list-name" class="box" [maxLength]="nameMax" placeholder="Our class" [value]="d.name"
                    (input)="rename($any($event.target).value)">
                </div>

                <div class="field">
                  <label for="list-add">Add characters <span class="small">· {{ d.characters.length }} / {{ sizeMax }}</span></label>
                  <div class="add-row">
                    <input id="list-add" class="box" autocomplete="off" placeholder="Darth Vader, Shrek, Cleopatra…"
                      [value]="adding()" (input)="adding.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); add()">
                    <button type="button" class="btn add" [disabled]="!adding().trim()" (click)="add()">Add</button>
                  </div>
                  <span class="small">Press Enter after each one, or paste many separated by commas.</span>
                  @if (notice(); as n) { <span class="notice" role="status">{{ n }}</span> }
                </div>

                <ul class="chips" aria-label="Characters in this list">
                  @for (c of d.characters; track c) {
                    <li class="chip">{{ c }}<button type="button" [attr.aria-label]="'Remove ' + c" (click)="removeCharacter(c)">×</button></li>
                  } @empty {
                    <li class="small">No characters yet. A game needs at least one per player.</li>
                  }
                </ul>

                @if (error(); as e) { <p class="error-text" role="alert">{{ e }}</p> }
                <div class="actions">
                  @if (d.id) { <button type="button" class="btn btn-ghost delete" [disabled]="busy()" (click)="deleteList()">Delete list</button> }
                  <span class="spacer"></span>
                  @if (saved()) { <span class="saved" role="status">✓ Saved</span> }
                  <button type="button" class="btn btn-primary" [disabled]="!canSave() || busy()" (click)="save()">{{ busy() ? 'Saving…' : 'Save list' }}</button>
                </div>
              </div>
            } @else {
              <div class="editor empty">
                <p class="muted">{{ lists().length ? 'Pick a list to edit it, or make a new one.' : 'Make your first list: your class, your office, your favourite films…' }}</p>
              </div>
            }
          </div>
        }
      }
    </section>
  `,
    styles: `
    :host { display: block; min-width: 0; }
    .lists { display: flex; flex-direction: column; gap: 14px; padding: 24px; border-radius: 24px; }
    .head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .head h2 { margin: 0; font-size: 22px; }
    .muted { margin: 0; color: var(--text-2); }
    .small { font-size: 12px; color: var(--muted); }
    .link { border: none; background: none; padding: 0; color: var(--accent-text); font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; }

    .body { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; }
    .picker { display: flex; flex-direction: column; gap: 8px; }
    .list-card { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font: inherit; text-align: left; cursor: pointer; }
    .list-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .list-card.on { border-color: var(--accent); background: var(--accent-tint); }
    .list-card.new { border-style: dashed; border-color: var(--border-strong); background: transparent; color: var(--text-2); font-weight: 700; text-align: center; }
    .list-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .editor { min-width: 0; display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: 18px; background: var(--surface-2); border: 1px solid var(--border); }
    .editor.empty { justify-content: center; min-height: 120px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-weight: 600; font-size: 14px; }
    .box { height: 46px; padding: 0 14px; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); font: inherit; min-width: 0; }
    .box:focus { outline: none; border-color: var(--accent); }
    .add-row { display: flex; gap: 8px; }
    .add-row .box { flex: 1; }
    .add { height: 46px; }
    .notice { font-size: 12px; font-weight: 700; color: var(--warn-text); }

    .chips { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 8px; max-height: 260px; overflow-y: auto; }
    .chip { display: inline-flex; align-items: center; gap: 4px; height: 34px; padding: 0 4px 0 12px; border-radius: 11px; background: var(--surface); border: 1px solid var(--border); font-weight: 600; font-size: 14px; max-width: 100%; }
    .chip button { width: 26px; height: 26px; border: none; border-radius: 8px; background: transparent; color: var(--muted); font-size: 17px; cursor: pointer; }
    .chip button:hover { background: var(--no-soft); color: var(--no-text); }

    .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .spacer { flex: 1; }
    .delete { color: var(--no-text); border-color: var(--no); }
    .saved { font-weight: 700; color: var(--yes-text); font-size: 13px; }

    @media (max-width: 760px) {
      .lists { padding: 18px; }
      .body { grid-template-columns: 1fr; }
      .picker { flex-direction: row; overflow-x: auto; padding-bottom: 4px; }
      .list-card { flex: none; max-width: 180px; }
    }
  `,
})
export class ListManager implements OnInit {
    private readonly lists$ = inject(ListService);
    private readonly confirm = inject(ConfirmService);

    protected readonly nameMax = LIST_NAME_MAX;
    protected readonly sizeMax = LIST_SIZE_MAX;
    protected readonly state = signal<LoadState>('loading');
    protected readonly lists = signal<CharacterList[]>([]);
    protected readonly draft = signal<Draft | null>(null);
    protected readonly adding = signal('');
    protected readonly notice = signal<string | null>(null);
    protected readonly error = signal<string | null>(null);
    protected readonly busy = signal(false);
    protected readonly saved = signal(false);

    protected readonly canSave = computed(() => {
        const d = this.draft();
        if (!d || !d.name.trim() || d.characters.length === 0) return false;
        const original = this.lists().find(l => l.id === d.id);
        return !original || original.name !== d.name.trim() || original.characters.join('\n') !== d.characters.join('\n');
    });

    ngOnInit(): void {
        this.load();
    }

    protected load(): void {
        this.state.set('loading');
        this.lists$.myLists().subscribe({
            next: lists => {
                this.lists.set(lists);
                this.state.set('ready');
            },
            error: (e: HttpErrorResponse) => this.state.set(e.status === 404 || e.error?.code === 'PGRST205' ? 'missing' : 'error'),
        });
    }

    protected open(list: CharacterList): void {
        this.draft.set({ id: list.id, name: list.name, characters: [...list.characters] });
        this.reset();
    }

    protected startNew(): void {
        this.draft.set({ id: null, name: '', characters: [] });
        this.reset();
        setTimeout(() => document.getElementById('list-name')?.focus());
    }

    protected rename(name: string): void {
        this.draft.update(d => (d ? { ...d, name } : d));
        this.saved.set(false);
    }

    protected add(): void {
        const d = this.draft();
        if (!d) return;
        const typed = this.adding().split('\n').join(',').split(',').map(n => n.split(' ').filter(w => w).join(' ')).filter(n => n);
        const next = [...d.characters];
        const skipped: string[] = [];
        for (const name of typed) {
            const same = next.some(c => c.toLowerCase() === name.toLowerCase());
            if (name.length < 2 || name.length > CHARACTER_MAX || same || next.length >= LIST_SIZE_MAX) skipped.push(name);
            else next.push(name);
        }
        this.draft.set({ ...d, characters: next });
        this.adding.set('');
        this.saved.set(false);
        this.notice.set(skipped.length ? `Skipped ${skipped.join(', ')}: already in the list, too short, too long (${CHARACTER_MAX} letters max) or the list is full.` : null);
    }

    protected removeCharacter(name: string): void {
        this.draft.update(d => (d ? { ...d, characters: d.characters.filter(c => c !== name) } : d));
        this.saved.set(false);
    }

    protected save(): void {
        const d = this.draft();
        if (!d || !this.canSave()) return;
        this.busy.set(true);
        this.error.set(null);
        const name = d.name.trim();
        const request = d.id ? this.lists$.save(d.id, name, d.characters) : this.lists$.create(name, d.characters);
        request.subscribe({
            next: list => {
                this.lists.update(all => [list, ...all.filter(l => l.id !== list.id)]);
                this.draft.set({ id: list.id, name: list.name, characters: [...list.characters] });
                this.busy.set(false);
                this.saved.set(true);
            },
            error: () => {
                this.busy.set(false);
                this.error.set("Couldn't save the list. Check your connection and try again.");
            },
        });
    }

    protected async deleteList(): Promise<void> {
        const d = this.draft();
        if (!d?.id) return;
        const yes = await this.confirm.ask({
            tone: 'danger',
            title: `Delete "${d.name}"?`,
            text: 'The list and its characters are removed. Rooms already playing with it keep their characters.',
            confirmLabel: 'Delete list',
        });
        if (!yes) return;
        this.busy.set(true);
        this.lists$.remove(d.id).subscribe({
            next: () => {
                this.lists.update(all => all.filter(l => l.id !== d.id));
                this.draft.set(null);
                this.busy.set(false);
            },
            error: () => {
                this.busy.set(false);
                this.error.set("Couldn't delete the list. Try again.");
            },
        });
    }

    private reset(): void {
        this.adding.set('');
        this.notice.set(null);
        this.error.set(null);
        this.saved.set(false);
    }
}
