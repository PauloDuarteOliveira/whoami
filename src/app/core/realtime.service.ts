import { Injectable, inject } from '@angular/core';
import { Player } from './models';
import { SUPABASE } from './supabase.client';

export interface RoomWatchers {
    /** Something in the room changed (room, characters, questions, votes, notes, boards, players joining or leaving). */
    changed: () => void;
    /** A player row changed (status, role, heartbeat…): the new row is applied without reloading everything. */
    player: (player: Player) => void;
    /** Whether the live connection is up, so the app can fall back to frequent polling when it isn't. */
    live: (connected: boolean) => void;
}

/**
 * Live updates with Supabase Realtime: the database pushes a message when a row of this room changes.
 * Row Level Security applies, so a player only hears about rooms they're in.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
    private readonly client = inject(SUPABASE);

    /** Starts listening to one room. Returns a function that stops listening. */
    watchRoom(roomId: string, on: RoomWatchers): () => void {
        const inRoom = `room_id=eq.${roomId}`;
        const changed = () => on.changed();

        const channel = this.client
            .channel(`room:${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, changed)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: inRoom }, changed)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: inRoom }, payload =>
                on.player(payload.new as Player),
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: inRoom }, changed)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: inRoom }, changed)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: inRoom }, changed)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'whiteboards', filter: inRoom }, changed)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reports', filter: inRoom }, changed)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'report_votes', filter: inRoom }, changed)
            // Votes have no room_id; Row Level Security only sends the ones from rooms you're in.
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, changed)
            // Deleted rows can't be filtered by room, so any deletion (a player leaving the lobby,
            // a duplicate character removed) just triggers a reload.
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players' }, changed)
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'characters' }, changed)
            // If Supabase refuses the changes (for example a table missing from the Realtime publication),
            // no change arrives at all, so the room goes back to frequent reloads.
            .on('system', {}, (message: { status?: string; extension?: string }) => {
                if (message.status === 'error' && message.extension === 'postgres_changes') on.live(false);
            })
            .subscribe(status => on.live(status === 'SUBSCRIBED'));

        return () => {
            on.live(false);
            void this.client.removeChannel(channel);
        };
    }
}
