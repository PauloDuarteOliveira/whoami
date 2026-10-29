import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Answer, ClueGroup, GuessVerdict, Question, Room, Vote } from './models';
import { SupabaseApiService } from './supabase-api.service';

/**
 * The answer to a question.
 * - If more people are unsure than voted for Yes or for No, the answer is Unsure (5 Unsure + 1 Yes → Unsure).
 * - Otherwise Yes and No are compared: more votes wins, a tie is Unsure (Yes + No → Unsure).
 * Someone who knows still beats one who isn't sure: Yes + Unsure → Yes.
 */
export function majority(votes: Vote[]): Answer {
    const yes = votes.filter(v => v.value === 'yes').length;
    const no = votes.filter(v => v.value === 'no').length;
    const unsure = votes.filter(v => v.value === 'unsure').length;
    if (unsure > Math.max(yes, no)) return 'unsure';
    if (yes > no) return 'yes';
    if (no > yes) return 'no';
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

/** Voice mode: questions and guesses are spoken, so the app records only that they happened. */
export const VOICE_QUESTION = 'Asked out loud';
export const VOICE_GUESS = 'Said out loud';

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