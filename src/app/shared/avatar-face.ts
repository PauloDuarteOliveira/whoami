import { Component, Input } from '@angular/core';
import { Player } from '../core/models';
import { avatarUrl, isAvatar } from './avatars';
import { initials } from './initials';

/**
 * What goes inside an avatar circle: the player's animal, or their initials if they have none
 * (players from before avatars existed). The circle itself (size, colour, online dot) stays with
 * each screen, so this fits every avatar in the app.
 */
@Component({
    selector: 'app-face',
    template: `
    @if (picture(); as src) {
      <img [src]="src" alt="" draggable="false">
    } @else {
      {{ letters() }}
    }
  `,
    styles: `
    :host { display: contents; }
    img { width: 78%; height: 78%; display: block; pointer-events: none; }
  `,
})
export class AvatarFace {
    @Input({ required: true }) player!: Pick<Player, 'id' | 'name' | 'joined_at' | 'status'> & { avatar?: string | null };
    /** The room's players, for initials that tell people apart. */
    @Input() players: Pick<Player, 'id' | 'name' | 'joined_at' | 'status'>[] = [];

    protected picture(): string | null {
        return isAvatar(this.player.avatar) ? avatarUrl(this.player.avatar) : null;
    }

    protected letters(): string {
        return initials(this.player, this.players.length ? this.players : [this.player]);
    }
}
