// Interfaces for the main WhoAmI entities. They mirror the tables in supabase/schema.sql.

export type GameMode = 'voice' | 'novoice';
/** custom: everyone writes · deck: a pre-made deck · list: one of the host's own lists (migration 009). */
export type CharacterSource = 'deck' | 'custom' | 'list';
export type RoomStatus = 'lobby' | 'writing' | 'playing' | 'finished';
export type TurnPhase = 'question' | 'answer_vote' | 'guess' | 'guess_vote';
export type PlayerRole = 'admin' | 'helper' | 'player' | 'spectator';
export type PlayerStatus = 'playing' | 'finished' | 'gave_up' | 'kicked' | 'left';
export type QuestionKind = 'question' | 'guess';
export type Answer = 'yes' | 'no' | 'unsure';
export type GuessVerdict = 'correct' | 'wrong';
export type Outcome = 'guessed' | 'gave_up' | 'last';

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
  /** The host's character list, when character_source is 'list'. */
  list_id?: string | null;
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
  /** One of the 30 animals (shared/avatars.ts); null for players from before avatars. */
  avatar?: string | null;
  last_seen: string;
  joined_at: string;
  user_id: string | null;
}

export interface Character {
  id: string;
  room_id: string;
  name: string;
  written_by: string | null;
  assigned_to: string | null;
  created_at: string;
}

export interface Question {
  id: string;
  room_id: string;
  player_id: string;
  turn_number: number;
  kind: QuestionKind;
  text: string;
  result: Answer | GuessVerdict | null;
  overruled: boolean;
  created_at: string;
}

export interface Vote {
  id: string;
  question_id: string;
  voter_id: string;
  value: Answer | GuessVerdict;
  created_at: string;
}

export interface RankedPlayer {
  place: number;
  player: Player;
  character: string;
  outcome: Outcome;
  questionsAsked: number;
  guesses: Question[];
}

export interface ClueGroup {
  answer: Answer;
  items: Question[];
}

export interface Note {
  player_id: string;
  room_id: string;
  text: string;
  visible: boolean;
  updated_at: string;
}

/** A player's drawing Board: one per player, saved as a PNG data URL. */
export interface Whiteboard {
  player_id: string;
  room_id: string;
  image: string;
  shared: boolean;
  updated_at: string;
}

/** A board without its picture: enough to know if it changed. */
export type WhiteboardInfo = Omit<Whiteboard, 'image'>;

/** A reported (troll) character: the room votes, then the writer rewrites it (game design, section 4). */
export type ReportStatus = 'voting' | 'kept' | 'replaced' | 'rewritten';
/** Second time a writer's character is replaced: the Admin or a Helper decides. */
export type ReportDecision = 'pending' | 'chance' | 'kicked';

export interface Report {
  id: string;
  room_id: string;
  character_id: string;
  receiver_id: string;
  writer_id: string | null;
  reporter_id: string;
  character_name: string;
  status: ReportStatus;
  admin_decision: ReportDecision | null;
  created_at: string;
}

export type ReportVoteValue = 'keep' | 'replace';

export interface ReportVote {
  report_id: string;
  voter_id: string;
  room_id: string;
  value: ReportVoteValue;
  created_at: string;
}

/** A chat message in a room (see supabase/migrations/006). */
export interface ChatMessage {
  id: string;
  room_id: string;
  /** Null for a message from the app itself. */
  player_id: string | null;
  text: string;
  created_at: string;
}
