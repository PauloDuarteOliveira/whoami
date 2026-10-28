import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AccountSync } from '../../core/account-sync.service';
import { AuthService } from '../../core/auth.service';
import { DeckService } from '../../core/deck.service';
import { CharacterList, ListService } from '../../core/list.service';
import { CharacterSource, Deck, GameMode } from '../../core/models';
import { ProfileService } from '../../core/profile.service';
import { RoomService, RoomSettings } from '../../core/room.service';
import { SessionService } from '../../core/session.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { SettingsSummary } from '../../shared/settings-summary/settings-summary';

/** Questions a player must ask before they can give up. */
const DEFAULT_GIVE_UP_AFTER = 5;

/** A deck must be picked when the room uses a pre-made deck, and a list when it uses one of yours. */
function deckRequired(group: AbstractControl): ValidationErrors | null {
  const { characterSource, deckId, listId } = group.value;
  if (characterSource === 'deck' && !deckId) return { deckRequired: true };
  if (characterSource === 'list' && !listId) return { listRequired: true };
  return null;
}

type OptionControl = 'mode' | 'characterSource' | 'deckId' | 'listId' | 'turnTimer' | 'writingTimer';

@Component({
  selector: 'app-create-room',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, SettingsSummary],
  templateUrl: './create-room.html',
  styleUrl: './create-room.css',
})
export class CreateRoom implements OnInit {
  private readonly rooms = inject(RoomService);
  private readonly decks = inject(DeckService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly profile = inject(ProfileService);
  private readonly account = inject(AccountSync);
  private readonly auth = inject(AuthService);

  /** Signed-in players can keep these settings for next time. */
  protected readonly signedIn = computed(() => !this.auth.isAnonymous());
  /** The form started from the account's saved settings. */
  protected readonly fromSaved = signal(false);
  protected readonly saveAsMine = signal(true);
  private readonly listService = inject(ListService);
  /** Your character lists for "My lists" (null while loading; empty without any or before migration 009). */
  protected readonly myLists = signal<CharacterList[] | null>(null);

  protected readonly turnTimers = [null, 60, 120, 180];
  protected readonly writingTimers = [null, 30, 60, 90];

  protected readonly form = new FormGroup(
    {
      mode: new FormControl<GameMode>('novoice', { nonNullable: true }),
      characterSource: new FormControl<CharacterSource>('custom', { nonNullable: true }),
      deckId: new FormControl<string | null>(null),
      listId: new FormControl<string | null>(null),
      giveUpAfter: new FormControl(DEFAULT_GIVE_UP_AFTER, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(99)] }),
      turnTimer: new FormControl<number | null>(null),
      writingTimer: new FormControl<number | null>(null),
    },
    { validators: deckRequired },
  );

  /** The form value as a signal, so the summary on the right updates live. */
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly deckList = signal<Deck[]>([]);
  protected readonly decksLoading = signal(true);
  protected readonly decksError = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  ngOnInit(): void {
    // The name is typed on Home. Without it, go back there first.
    if (!this.profile.name()) {
      this.router.navigate(['/']);
      return;
    }

    // Signed in with saved settings: start from them.
    const saved = this.account.roomSettings();
    if (saved) {
      this.form.setValue({
        mode: saved.mode,
        characterSource: saved.character_source,
        deckId: saved.deck_id,
        listId: saved.list_id ?? null,
        giveUpAfter: saved.give_up_after,
        turnTimer: saved.turn_timer_sec,
        writingTimer: saved.writing_timer_sec,
      });
      this.fromSaved.set(true);
    }

    if (this.signedIn()) {
      this.listService.myLists().subscribe({
        next: lists => {
          this.myLists.set(lists);
          // A saved list that was deleted since: the player picks another one.
          const listId = this.form.controls.listId.value;
          if (listId && !lists.some(l => l.id === listId)) this.form.controls.listId.setValue(null);
        },
        error: () => this.myLists.set([]),
      });
    }

    this.decks.getDecks().subscribe({
      next: decks => {
        this.deckList.set(decks);
        this.decksLoading.set(false);
        // A saved deck that no longer exists: the player picks another one.
        const deckId = this.form.controls.deckId.value;
        if (deckId && !decks.some(d => d.id === deckId)) this.form.controls.deckId.setValue(null);
      },
      error: () => {
        this.decksError.set(true);
        this.decksLoading.set(false);
      },
    });
  }

  /** The settings in the shape the database expects. */
  protected settings(): RoomSettings {
    const v = this.formValue();
    const custom = v.characterSource === 'custom';
    return {
      mode: v.mode ?? 'novoice',
      character_source: v.characterSource ?? 'custom',
      deck_id: v.characterSource === 'deck' ? (v.deckId ?? null) : null,
      list_id: v.characterSource === 'list' ? (v.listId ?? null) : null,
      give_up_after: v.giveUpAfter ?? DEFAULT_GIVE_UP_AFTER,
      turn_timer_sec: (v.turnTimer ?? null) as RoomSettings['turn_timer_sec'],
      writing_timer_sec: custom ? ((v.writingTimer ?? null) as RoomSettings['writing_timer_sec']) : null,
    };
  }

  protected listName(): string | null {
    return this.myLists()?.find(l => l.id === this.formValue().listId)?.name ?? null;
  }

  protected deckName(): string | null {
    return this.deckList().find(d => d.id === this.formValue().deckId)?.name ?? null;
  }

  /** Option buttons (mode, source, deck, timers) set their form control directly. */
  protected pick(control: OptionControl, value: string | number | null): void {
    const target = this.form.controls[control] as FormControl<string | number | null>;
    target.setValue(value);
    target.markAsTouched();
  }

  protected stepGiveUp(delta: number): void {
    const next = Math.min(99, Math.max(1, this.form.controls.giveUpAfter.value + delta));
    this.form.controls.giveUpAfter.setValue(next);
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);

    const settings = this.settings();
    // Kept with the account for next time (in the background: the room doesn't wait for it).
    if (this.signedIn() && this.saveAsMine()) void this.account.saveRoomSettings(settings);

    this.rooms.create(settings, this.profile.name(), this.profile.avatar()).subscribe({
      next: ({ room, admin }) => {
        this.session.save(room.code, admin.id);
        this.router.navigate(['/room', room.code]);
      },
      error: () => {
        this.submitError.set('Could not create the room. Check your connection and try again.');
        this.submitting.set(false);
      },
    });
  }
}