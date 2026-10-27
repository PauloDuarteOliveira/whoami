import { Player } from '../core/models';

type Named = Pick<Player, 'id' | 'name' | 'joined_at' | 'status'>;

const letters = (name: string) => [...name.trim()];
const firstTwo = (name: string) => letters(name).slice(0, 2).join('').toLowerCase();

/**
 * The letters on a player's avatar, so two players never look the same in one room:
 * - one letter when nobody else in the room starts with it ("M");
 * - otherwise the first two letters when they tell them apart ("An" for Ana, "Al" for Alex);
 * - otherwise the initial and a number by join order ("A1" for Ana, "A2" for André).
 * Players who were kicked or left don't count.
 */
export function initials(player: Named, room: Named[]): string {
    const first = (letters(player.name)[0] ?? '?').toUpperCase();
    const here = room.filter(p => p.id === player.id || (p.status !== 'kicked' && p.status !== 'left'));
    const sameInitial = here.filter(p => (letters(p.name)[0] ?? '').toUpperCase() === first);
    if (sameInitial.length <= 1) return first;

    const two = firstTwo(player.name);
    const sameTwo = sameInitial.filter(p => firstTwo(p.name) === two);
    if (sameTwo.length <= 1) return first + (letters(player.name)[1] ?? '').toLowerCase();

    const order = [...sameInitial].sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.id.localeCompare(b.id));
    return first + (order.findIndex(p => p.id === player.id) + 1);
}
