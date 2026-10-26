import { Injectable } from '@angular/core';

const STORAGE_KEY = 'whoami.sessions';

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

  /** Forgets every room in this tab (used when the tab signs in as a different user, who doesn't own those players). */
  forgetAll(): void {
    this.write({});
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
      // Storage blocked (e.g. private mode): the session only lasts until the page reloads.
    }
  }
}