import { Player } from '../core/models';

type Named = Pick<Player, 'id' | 'name' | 'joined_at' | 'status'>;

const letters = (name: string) => [...name.trim()];
const firstTwo = (name: string) => letters(name).slice(0, 2).join('').toLowerCase();

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
