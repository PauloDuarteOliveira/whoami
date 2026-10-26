import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { cleanName } from '../shared/validators';
import { Character, Report, ReportVote, ReportVoteValue } from './models';
import { SupabaseApiService } from './supabase-api.service';

/** Reports of troll characters, their votes, and the rewrite (see supabase/migrations/005). */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly api = inject(SupabaseApiService);

  /** An empty list if the reports table isn't there yet, so the game still loads without migration 005. */
  getReports(roomId: string): Observable<Report[]> {
    return this.api.select<Report>('reports', { room_id: `eq.${roomId}`, order: 'created_at.asc' }).pipe(catchError(() => of([])));
  }

  getVotes(roomId: string): Observable<ReportVote[]> {
    return this.api.select<ReportVote>('report_votes', { room_id: `eq.${roomId}` }).pipe(catchError(() => of([])));
  }

  create(character: Character, reporterId: string): Observable<Report> {
    return this.api.insertOne<Report>('reports', {
      room_id: character.room_id,
      character_id: character.id,
      receiver_id: character.assigned_to!,
      writer_id: character.written_by,
      reporter_id: reporterId,
      character_name: character.name,
    });
  }

  vote(report: Report, voterId: string, value: ReportVoteValue): Observable<ReportVote> {
    return this.api.insertOne<ReportVote>('report_votes', { report_id: report.id, voter_id: voterId, room_id: report.room_id, value });
  }

  /** Changes a report only if it's still in `from`, so two devices can't record a result twice. */
  update(report: Report, from: Report['status'], changes: Partial<Report>): Observable<Report | null> {
    return this.api
      .update<Report>('reports', { id: `eq.${report.id}`, status: `eq.${from}` }, changes)
      .pipe(map(rows => rows[0] ?? null));
  }

  setDecision(report: Report, decision: Report['admin_decision']): Observable<Report | null> {
    return this.api.update<Report>('reports', { id: `eq.${report.id}` }, { admin_decision: decision }).pipe(map(rows => rows[0] ?? null));
  }

  /** The writer's new character (allowed by Row Level Security only after a replace vote). */
  rename(characterId: string, name: string): Observable<Character | null> {
    return this.api.update<Character>('characters', { id: `eq.${characterId}` }, { name: cleanName(name) }).pipe(map(rows => rows[0] ?? null));
  }

  /** Hands the rewrite to another player (the Admin kicked the writer). */
  setWriter(characterId: string, playerId: string): Observable<unknown> {
    return this.api.update<Character>('characters', { id: `eq.${characterId}` }, { written_by: playerId });
  }
}
