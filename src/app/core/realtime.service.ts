import { Injectable, inject } from '@angular/core';
import { ChatMessage, Player } from './models';
import { SUPABASE } from './supabase.client';

export interface RoomWatchers {
    changed: () => void;
    player: (player: Player) => void;
    message: (message: ChatMessage) => void;
    live: (connected: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
    private readonly client = inject(SUPABASE);

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
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: inRoom }, payload =>
                on.message(payload.new as ChatMessage),
            )
            // Votes have no room_id; Row Level Security only sends the ones from rooms you're in.
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, changed)
            // Deleted rows can't be filtered by room, so any deletion (a player leaving the lobby,
            // a duplicate character removed) just triggers a reload.
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players' }, changed)
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'characters' }, changed)
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
