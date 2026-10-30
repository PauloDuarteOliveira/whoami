import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SupabaseApiService } from './supabase-api.service';

export interface CharacterList {
    id: string;
    name: string;
    characters: string[];
    updated_at: string;
}

export const LIST_NAME_MAX = 40;
export const LIST_SIZE_MAX = 200;
export const CHARACTER_MAX = 40;

@Injectable({ providedIn: 'root' })
export class ListService {
    private readonly api = inject(SupabaseApiService);

    myLists(): Observable<CharacterList[]> {
        return this.api.select<CharacterList>('character_lists', { select: 'id,name,characters,updated_at', order: 'updated_at.desc' });
    }

    get(id: string): Observable<CharacterList | null> {
        return this.api.select<CharacterList>('character_lists', { id: `eq.${id}` }).pipe(map(rows => rows[0] ?? null));
    }

    create(name: string, characters: string[]): Observable<CharacterList> {
        return this.api.insertOne<CharacterList>('character_lists', { name, characters });
    }

    save(id: string, name: string, characters: string[]): Observable<CharacterList> {
        return this.api
            .update<CharacterList>('character_lists', { id: `eq.${id}` }, { name, characters, updated_at: new Date().toISOString() })
            .pipe(map(rows => rows[0]));
    }

    remove(id: string): Observable<void> {
        return this.api.delete('character_lists', { id: `eq.${id}` });
    }
}
