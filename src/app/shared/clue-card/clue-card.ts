import { Component, Input } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { Answer, ClueGroup, Player } from '../../core/models';
import { plural } from '../format';

@Component({
    selector: 'app-clue-card',
    imports: [UpperCasePipe],
    templateUrl: './clue-card.html',
    styleUrl: './clue-card.css',
})
export class ClueCard {
    @Input({ required: true }) player!: Player;
    @Input({ required: true }) groups: ClueGroup[] = [];
    @Input() status = '';
    @Input() isMe = false;
    @Input() isCurrent = false;
    @Input() dimmed = false;
    @Input() filter: Answer | 'all' = 'all';

    protected visible(): ClueGroup[] {
        return this.filter === 'all' ? this.groups : this.groups.filter(g => g.answer === this.filter);
    }

    protected countLabel(): string {
        return plural(this.groups.reduce((sum, g) => sum + g.items.length, 0), 'answer');
    }
}
