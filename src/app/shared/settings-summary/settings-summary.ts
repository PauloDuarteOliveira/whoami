import { Component, Input } from '@angular/core';
import { RoomSettings } from '../../core/room.service';
import { plural } from '../format';

@Component({
  selector: 'app-settings-summary',
  template: `
    <dl class="rows">
      <div><dt>Mode</dt><dd>{{ settings.mode === 'voice' ? 'Voice' : 'No-Voice' }}</dd></div>
      <div>
        <dt>Characters</dt>
        <dd>
          @switch (settings.character_source) {
            @case ('custom') { Custom Pool }
            @case ('deck') { {{ deckName || 'Pre-made deck' }} }
            @case ('list') { {{ listName ? 'My list · ' + listName : 'My list' }} }
          }
        </dd>
      </div>
      <div><dt>Give up after</dt><dd>{{ plural(settings.give_up_after, 'question') }}</dd></div>
      <div><dt>Turn timer</dt><dd>{{ settings.turn_timer_sec ? settings.turn_timer_sec / 60 + ' min' : 'No timer' }}</dd></div>
      @if (settings.character_source === 'custom') {
        <div><dt>Writing timer</dt><dd>{{ settings.writing_timer_sec ? settings.writing_timer_sec + ' s' : 'No timer' }}</dd></div>
      }
    </dl>
  `,
  styles: `
    .rows { margin: 0; display: flex; flex-direction: column; gap: 12px; }
    .rows div { display: flex; justify-content: space-between; gap: 12px; }
    dt { color: var(--text-3); }
    dd { margin: 0; font-weight: 700; color: var(--text); text-align: right; }
  `,
})
export class SettingsSummary {
  @Input({ required: true }) settings!: RoomSettings;
  @Input() deckName: string | null = null;
  @Input() listName: string | null = null;

  protected readonly plural = plural;
}