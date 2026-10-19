// Interfaces for the main WhoAmI entities. They mirror the tables in supabase/schema.sql.

export type GameMode = 'voice' | 'novoice';
export type CharacterSource = 'deck' | 'custom';
export type RoomStatus = 'lobby' | 'writing' | 'playing' | 'finished';
export type TurnPhase = 'question' | 'answer_vote' | 'guess' | 'guess_vote';
export type PlayerRole = 'admin' | 'helper' | 'player' | 'spectator';
export type PlayerStatus = 'playing' | 'finished' | 'gave_up' | 'kicked' | 'left';

export interface Deck {
  id: string;
  name: string;
  description: string;
}

export interface DeckCard {
  id: string;
  deck_id: string;
  name: string;
}

export interface Room {
  id: string;
  code: string;
  mode: GameMode;
  character_source: CharacterSource;
  deck_id: string | null;
  give_up_after: number;
  turn_timer_sec: 60 | 120 | 180 | null;
  writing_timer_sec: 30 | 60 | 90 | null;
  hide_names: boolean;
  status: RoomStatus;
  turn_number: number;
  current_player_id: string | null;
  turn_phase: TurnPhase;
  turn_started_at: string | null;
  writing_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: string;
  room_id: string;
  name: string;
  color: string;
  role: PlayerRole;
  status: PlayerStatus;
  turn_position: number | null;
  finish_place: number | null;
  finish_turn: number | null;
  muted: boolean;
  last_seen: string;
  joined_at: string;
}