import { Character, Player, Report, ReportVote } from './models';

/** The report still being dealt with for a character (a vote, or a rewrite), if any. */
export function openReport(reports: Report[], characterId: string): Report | null {
    return reports.find(r => r.character_id === characterId && (r.status === 'voting' || r.status === 'replaced')) ?? null;
}

/** Who writes the character now: the original writer, or whoever the Admin handed it to. */
export function writerOf(report: Report, characters: Character[]): string | null {
    return characters.find(c => c.id === report.character_id)?.written_by ?? report.writer_id;
}

/**
 * Who votes on a report: everyone playing (finished players too) except the receiver, who can't see
 * the character, and the writer. Players who went offline only count if they already voted.
 */
export function reportVoters(report: Report, players: Player[], characters: Character[], votes: ReportVote[], isOnline: (p: Player) => boolean): Player[] {
    const writer = writerOf(report, characters);
    const voted = new Set(votes.filter(v => v.report_id === report.id).map(v => v.voter_id));
    return players.filter(
        p => p.role !== 'spectator' && p.id !== report.receiver_id && p.id !== writer && (isOnline(p) || voted.has(p.id)),
    );
}

/** The result once it's decided: most votes replace it, a tie (or more "keep") keeps it. */
export function reportResult(report: Report, voters: Player[], votes: ReportVote[]): 'replaced' | 'kept' | null {
    const ids = new Set(voters.map(v => v.id));
    const counted = votes.filter(v => v.report_id === report.id && ids.has(v.voter_id));
    const replace = counted.filter(v => v.value === 'replace').length;
    const keep = counted.length - replace;
    if (replace * 2 > voters.length) return 'replaced';
    if (keep * 2 >= voters.length) return 'kept';
    return null;
}

/** How many of a writer's characters the room has replaced, this one included. */
export function strikes(reports: Report[], writerId: string | null, current: Report): number {
    if (!writerId) return 1;
    return reports.filter(r => r.id !== current.id && r.writer_id === writerId && (r.status === 'replaced' || r.status === 'rewritten')).length + 1;
}
