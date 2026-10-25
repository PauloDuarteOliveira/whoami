import { Component, Input, signal } from '@angular/core';
import { clueGroups } from '../../../core/question.service';
import { Answer, ClueGroup, Player, Question, Room } from '../../../core/models';
import { ClueCard } from '../../../shared/clue-card/clue-card';
import { placeLabel } from '../../../shared/format';

type Filter = Answer | 'all';

@Component({
    selector: 'app-clue-board',
    imports: [ClueCard],
    templateUrl: './clue-board.html',
    styleUrl: './clue-board.css',
})
export class ClueBoard {
    @Input({ required: true }) room!: Room;
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) questions: Question[] = [];
    @Input({ required: true }) me!: Player;
    @Input({ required: true }) isOnline!: (player: Player) => boolean;

    protected readonly filter = signal<Filter>('all');
    protected readonly filters: { value: Filter; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'unsure', label: 'Unsure' },
    ];

    /** Players still guessing (in turn order) first, then those who finished or gave up. */
    protected ordered(): Player[] {
        const byTurn = (a: Player, b: Player) => a.turn_position! - b.turn_position!;
        const inGame = this.players.filter(p => p.turn_position !== null);
        return [
            ...inGame.filter(p => p.status === 'playing').sort(byTurn),
            ...inGame.filter(p => p.status !== 'playing').sort(byTurn),
        ];
    }

    protected groupsOf(player: Player): ClueGroup[] {
        return clueGroups(player.id, this.questions);
    }

    protected statusOf(player: Player): string {
        if (player.status === 'finished') return `guessed · ${placeLabel(player.finish_place)}`;
        if (player.status === 'gave_up') return 'gave up';
        if (!this.isOnline(player)) return 'offline';
        return player.id === this.room.current_player_id ? 'asking now' : 'playing';
    }
}
