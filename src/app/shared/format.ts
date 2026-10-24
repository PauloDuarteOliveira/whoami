export function placeLabel(place: number | null): string {
    if (!place) return '';
    const ends: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
    return place + (ends[place] ?? 'th');
}