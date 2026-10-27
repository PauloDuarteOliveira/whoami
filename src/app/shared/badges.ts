import { GameRecord } from '../core/history.service';

/** A badge and how far you are: earned when `current` reaches `target`. */
export interface BadgeState {
    id: string;
    /** The short mark in the badge's circle. */
    glyph: string;
    name: string;
    /** What to do to unlock it, said to the player. */
    how: string;
    current: number;
    target: number;
    earned: boolean;
}

interface Badge {
    id: string;
    glyph: string;
    name: string;
    how: string;
    target: number;
    /** How much of the target the player has, from their finished games (oldest first). */
    count: (games: GameRecord[]) => number;
}

const guessed = (g: GameRecord) => g.status === 'finished';
const won = (g: GameRecord) => g.finish_place === 1;
const players = (g: GameRecord) => g.others.length + 1;
const hour = (g: GameRecord) => new Date(g.ended_at).getHours();
const count = (games: GameRecord[], test: (g: GameRecord) => boolean) => games.filter(test).length;
/** 1 when any game passes the test (for "do it once" badges). */
const any = (games: GameRecord[], test: (g: GameRecord) => boolean) => (games.some(test) ? 1 : 0);

/** The longest run of games in a row that you guessed. */
function bestStreak(games: GameRecord[]): number {
    let best = 0;
    let run = 0;
    for (const g of games) {
        run = guessed(g) ? run + 1 : 0;
        best = Math.max(best, run);
    }
    return best;
}

/** The most games you finished on one day. */
function bestDay(games: GameRecord[]): number {
    const perDay = new Map<string, number>();
    for (const g of games) {
        const day = new Date(g.ended_at).toDateString();
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    return Math.max(0, ...perDay.values());
}

/** All the badges, easiest first. Every one is worked out from your game history. */
const BADGES: Badge[] = [
    // Playing
    { id: 'first-game', glyph: '1st', name: 'First game', how: 'Finish your first game.', target: 1, count: g => g.length },
    { id: 'regular', glyph: '10', name: 'Regular', how: 'Finish 10 games.', target: 10, count: g => g.length },
    { id: 'veteran', glyph: '25', name: 'Veteran', how: 'Finish 25 games.', target: 25, count: g => g.length },
    { id: 'legend', glyph: '50', name: 'Legend', how: 'Finish 50 games.', target: 50, count: g => g.length },
    { id: 'marathon', glyph: '3/d', name: 'Marathon', how: 'Finish 3 games on the same day.', target: 3, count: bestDay },

    // Guessing
    { id: 'first-guess', glyph: '?!', name: 'First guess', how: 'Guess who you are in a game.', target: 1, count: g => count(g, guessed) },
    { id: 'detective', glyph: '10✓', name: 'Detective', how: 'Guess who you are in 10 games.', target: 10, count: g => count(g, guessed) },
    { id: 'sharp-mind', glyph: '≤5', name: 'Sharp mind', how: 'Guess who you are with 5 questions or fewer.', target: 1, count: g => any(g, x => guessed(x) && x.questions_asked <= 5) },
    { id: 'mind-reader', glyph: '≤3', name: 'Mind reader', how: 'Guess who you are with 3 questions or fewer.', target: 1, count: g => any(g, x => guessed(x) && x.questions_asked <= 3) },
    { id: 'bullseye', glyph: '◎', name: 'Bullseye', how: 'Get it right with your very first guess, 5 times.', target: 5, count: g => count(g, x => guessed(x) && x.guesses === 1) },
    { id: 'hot-streak', glyph: '3×', name: 'Hot streak', how: 'Guess who you are in 3 games in a row.', target: 3, count: bestStreak },
    { id: 'stubborn', glyph: '15+', name: 'Never give up', how: 'Guess who you are after asking 15 questions or more.', target: 1, count: g => any(g, x => guessed(x) && x.questions_asked >= 15) },

    // Winning
    { id: 'winner', glyph: '★', name: 'Winner', how: 'Be the first to guess in a game.', target: 1, count: g => count(g, won) },
    { id: 'champion', glyph: '5★', name: 'Champion', how: 'Be the first to guess in 5 games.', target: 5, count: g => count(g, won) },
    { id: 'big-win', glyph: '★6', name: 'Crowd pleaser', how: 'Be the first to guess in a game of 6 players or more.', target: 1, count: g => any(g, x => won(x) && players(x) >= 6) },

    // Hosting and parties
    { id: 'host', glyph: 'H', name: 'Host', how: 'Create a room and play it to the end.', target: 1, count: g => count(g, x => x.role === 'admin') },
    { id: 'party-host', glyph: '5H', name: 'Party host', how: 'Host 5 games to the end.', target: 5, count: g => count(g, x => x.role === 'admin') },
    { id: 'big-party', glyph: '6+', name: 'Big party', how: 'Play a game with 6 players or more.', target: 1, count: g => any(g, x => players(x) >= 6) },
    { id: 'crowd', glyph: '10+', name: 'Full house', how: 'Play a game with 10 players or more.', target: 1, count: g => any(g, x => players(x) >= 10) },

    // Ways to play
    { id: 'chatterbox', glyph: 'V', name: 'Chatterbox', how: 'Finish 5 games in Voice mode.', target: 5, count: g => count(g, x => x.mode === 'voice') },
    { id: 'silent', glyph: 'Sh', name: 'Silent type', how: 'Finish 5 games in No-Voice mode.', target: 5, count: g => count(g, x => x.mode === 'novoice') },
    { id: 'storyteller', glyph: '✎', name: 'Storyteller', how: 'Finish 5 games where everyone writes the characters.', target: 5, count: g => count(g, x => x.character_source === 'custom') },
    { id: 'collector', glyph: '▤', name: 'Deck collector', how: 'Finish 5 games with a pre-made deck or one of your lists.', target: 5, count: g => count(g, x => x.character_source !== 'custom') },

    // When you play
    { id: 'night-owl', glyph: '☾', name: 'Night owl', how: 'Finish a game between midnight and 5 in the morning.', target: 1, count: g => any(g, x => hour(x) < 5) },
    { id: 'early-bird', glyph: '☀', name: 'Early bird', how: 'Finish a game between 6 and 9 in the morning.', target: 1, count: g => any(g, x => hour(x) >= 6 && hour(x) < 9) },
    { id: 'good-sport', glyph: 'GG', name: 'Good sport', how: "Give up when you're stuck. It happens to everyone!", target: 1, count: g => count(g, x => x.status === 'gave_up') },
];

/** Every badge with your progress, from your finished games (any order). */
export function badgesFor(games: GameRecord[]): BadgeState[] {
    const oldestFirst = [...games].sort((a, b) => a.ended_at.localeCompare(b.ended_at));
    return BADGES.map(({ count: progress, ...badge }) => {
        const current = Math.min(progress(oldestFirst), badge.target);
        return { ...badge, current, earned: current >= badge.target };
    });
}
