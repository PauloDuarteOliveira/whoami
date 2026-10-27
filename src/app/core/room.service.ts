import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, map, switchMap, throwError } from 'rxjs';
import { Player, Room } from './models';
import { PlayerService } from './player.service';
import { SupabaseApiService } from './supabase-api.service';

export type RoomSettings = Pick<
    Room,
    'mode' | 'character_source' | 'deck_id' | 'give_up_after' | 'turn_timer_sec' | 'writing_timer_sec'
> & { list_id?: string | null };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable({ providedIn: 'root' })
export class RoomService {
    private readonly api = inject(SupabaseApiService);
    private readonly players = inject(PlayerService);

    getByCode(code: string): Observable<Room | null> {
        return this.api
            .select<Room>('rooms', { code: `eq.${code.toUpperCase()}` })
            .pipe(map(rooms => rooms[0] ?? null));
    }

    update(roomId: string, changes: Partial<Room>): Observable<Room> {
        return this.api.update<Room>('rooms', { id: `eq.${roomId}` }, changes).pipe(map(rows => rows[0]));
    }

    create(settings: RoomSettings, adminName: string, avatar: string | null = null): Observable<{ room: Room; admin: Player }> {
        return this.insertWithFreeCode(settings, 5).pipe(
            switchMap(room =>
                this.players.join(room.id, adminName, 'admin', [], avatar).pipe(map(admin => ({ room, admin }))),
            ),
        );
    }


    private insertWithFreeCode(settings: RoomSettings, attemptsLeft: number): Observable<Room> {
        // list_id only goes with a list, so rooms can still be created before migration 009 runs.
        const { list_id, ...rest } = settings;
        const row: Partial<Room> = settings.character_source === 'list' ? { ...rest, list_id } : rest;
        return defer(() => this.api.insertOne<Room>('rooms', { ...row, code: this.randomCode() })).pipe(
            catchError((err: HttpErrorResponse) =>
                err.status === 409 && attemptsLeft > 1
                    ? this.insertWithFreeCode(settings, attemptsLeft - 1)
                    : throwError(() => err),
            ),
        );
    }

    private randomCode(): string {
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
        }
        return code;
    }
}