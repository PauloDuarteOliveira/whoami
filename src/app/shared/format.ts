/** 1 → "1 question", 3 → "3 questions". */
export function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function placeLabel(place: number | null): string {
    if (!place) return '';
    const ends: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
    return place + (ends[place] ?? 'th');
}