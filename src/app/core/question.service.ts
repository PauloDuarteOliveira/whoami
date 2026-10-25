import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Answer, ClueGroup, GuessVerdict, Question, Room, Vote } from './models';
import { SupabaseApiService } from './supabase-api.service';

export function majority(votes: Vote[]): Answer {
    const count = (value: Answer) => votes.filter(v => v.value === value).length;
    const yes = count('yes');
    const no = count('no');
    const unsure = count('unsure');
    if (yes > no && yes > unsure) return 'yes';
    if (no > yes && no > unsure) return 'no';
    return 'unsure';
}

export function verdict(votes: Vote[]): GuessVerdict {
    const correct = votes.filter(v => v.value === 'correct').length;
    const wrong = votes.filter(v => v.value === 'wrong').length;
    return correct > wrong ? 'correct' : 'wrong';
}

/** A player's answered questions and guesses, grouped into YES / NO / UNSURE (a right guess counts as YES, a wrong one as NO). */
export function clueGroups(playerId: string, questions: Question[]): ClueGroup[] {
    const answered = questions.filter(q => q.player_id === playerId && q.result !== null);
    const groupOf = (q: Question): Answer =>
        q.result === 'correct' ? 'yes' : q.result === 'wrong' ? 'no' : (q.result as Answer);

    return (['yes', 'no', 'unsure'] as Answer[])
        .map(answer => ({ answer, items: answered.filter(q => groupOf(q) === answer) }))
        .filter(group => group.items.length > 0);
}

@Injectable({ providedIn: 'root' })
export class QuestionService {
    private readonly api = inject(SupabaseApiService);

    getQuestions(roomId: string): Observable<Question[]> {
        return this.api.select<Question>('questions', { room_id: `eq.${roomId}`, order: 'created_at.asc' });
    }

    getVotes(questionIds: string[]): Observable<Vote[]> {
        if (questionIds.length === 0) return of([]);
        return this.api.select<Vote>('votes', { question_id: `in.(${questionIds.join(',')})` });
    }

    ask(room: Room, playerId: string, text: string): Observable<Question> {
        return this.api.insertOne<Question>('questions', {
            room_id: room.id,
            player_id: playerId,
            turn_number: room.turn_number,
            kind: 'question',
            text: text.trim(),
        });
    }

    guess(room: Room, playerId: string, name: string): Observable<Question> {
        return this.api.insertOne<Question>('questions', {
            room_id: room.id,
            player_id: playerId,
            turn_number: room.turn_number,
            kind: 'guess',
            text: name.trim(),
        });
    }

    vote(questionId: string, voterId: string, value: Answer | GuessVerdict): Observable<Vote> {
        return this.api.insertOne<Vote>('votes', { question_id: questionId, voter_id: voterId, value });
    }

    setResult(questionId: string, result: Answer | GuessVerdict): Observable<unknown> {
        return this.api.update<Question>('questions', { id: `eq.${questionId}` }, { result });
    }
}