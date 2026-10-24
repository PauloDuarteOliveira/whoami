import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { rankPlayers } from '../../../core/game.service';
import { Character, Player, Question, RankedPlayer, Room } from '../../../core/models';
import { placeLabel, plural } from '../../../shared/format';

@Component({
    selector: 'app-results',
    imports: [DatePipe, DecimalPipe],
    templateUrl: './results.html',
    styleUrl: './results.css',
})
export class Results {
    @Input({ required: true }) room!: Room;
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) me!: Player;
    @Input({ required: true }) characters: Character[] = [];
    @Input({ required: true }) questions: Question[] = [];

    @Output() leave = new EventEmitter<void>();

    protected ranking(): RankedPlayer[] {
        return rankPlayers(this.players, this.characters, this.questions);
    }

    protected mine(): RankedPlayer | null {
        return this.ranking().find(r => r.player.id === this.me.id) ?? null;
    }

    protected nameOf(r: RankedPlayer): string {
        return r.player.id === this.me.id ? 'You' : r.player.name;
    }

    protected outcomeText(r: RankedPlayer): string {
        switch (r.outcome) {
            case 'guessed': return `Guessed on turn ${r.player.finish_turn}`;
            case 'gave_up': return `Gave up on turn ${r.player.finish_turn}`;
            default: return 'Last one left';
        }
    }

    protected placeLabel(place: number): string {
        return placeLabel(place);
    }

    protected plural(count: number, word: string): string {
        return plural(count, word);
    }

    /** The last turn that was played (room.turn_number has already moved on to the next one). */
    protected turnsPlayed(): number {
        return Math.max(0, ...this.questions.map(q => q.turn_number));
    }

    protected averageQuestions(): number {
        const list = this.ranking();
        return list.length ? list.reduce((sum, r) => sum + r.questionsAsked, 0) / list.length : 0;
    }
}