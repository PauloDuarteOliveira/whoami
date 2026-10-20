import { Injectable } from '@angular/core';

const STORAGE_KEY = 'whoami.sessions';

/**
 * Remembers which player you are in each room (room code -> player id),
 * so a page refresh puts you back in the same seat.
 * Per tab (sessionStorage), so several tabs can play as different players.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  getPlayerId(code: string): string | null {
    return this.read()[code.toUpperCase()] ?? null;
  }

  save(code: string, playerId: string): void {
    const sessions = this.read();
    sessions[code.toUpperCase()] = playerId;
    this.write(sessions);
  }

  forget(code: string): void {
    const sessions = this.read();
    delete sessions[code.toUpperCase()];
    this.write(sessions);
  }

  private read(): Record<string, string> {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  private write(sessions: Record<string, string>): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // Storage blocked (private mode): the session just won't survive a refresh.
    }
  }
}