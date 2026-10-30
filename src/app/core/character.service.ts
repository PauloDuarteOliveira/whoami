import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { cleanName } from '../shared/validators';
import { Character } from './models';
import { SupabaseApiService } from './supabase-api.service';

export function sameCharacter(a: string, b: string): boolean {
  return cleanName(a).localeCompare(cleanName(b), undefined, { sensitivity: 'base' }) === 0;
}

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly api = inject(SupabaseApiService);

  getCharacters(roomId: string): Observable<Character[]> {
    return this.api.select<Character>('characters', { room_id: `eq.${roomId}`, order: 'created_at.asc' });
  }

  write(roomId: string, playerId: string, name: string): Observable<Character> {
    return this.api.insertOne<Character>('characters', { room_id: roomId, written_by: playerId, name: cleanName(name) });
  }

  removeAll(roomId: string): Observable<void> {
    return this.api.delete('characters', { room_id: `eq.${roomId}` });
  }

  remove(characterId: string): Observable<void> {
    return this.api.delete('characters', { id: `eq.${characterId}` });
  }
}