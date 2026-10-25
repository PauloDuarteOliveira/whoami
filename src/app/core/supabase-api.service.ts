import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export type Query = Record<string, string>;

@Injectable({ providedIn: 'root' })
export class SupabaseApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.supabaseUrl}/rest/v1`;

  private headers(extra: Record<string, string> = {}): HttpHeaders {
    return new HttpHeaders({ apikey: environment.supabaseKey, ...extra });
  }

  select<T>(table: string, query: Query = {}): Observable<T[]> {
    return this.http.get<T[]>(`${this.baseUrl}/${table}`, {
      headers: this.headers(),
      params: new HttpParams({ fromObject: { select: '*', ...query } }),
    });
  }

  insert<T>(table: string, row: Partial<T> | Partial<T>[]): Observable<T[]> {
    return this.http.post<T[]>(`${this.baseUrl}/${table}`, row, {
      headers: this.headers({ Prefer: 'return=representation' }),
    });
  }

  insertOne<T>(table: string, row: Partial<T>): Observable<T> {
    return this.insert<T>(table, row).pipe(map(rows => rows[0]));
  }

  /** Inserts the row, or updates it if a row with the same primary key already exists. */
  upsert<T>(table: string, row: Partial<T>): Observable<T> {
    return this.http
      .post<T[]>(`${this.baseUrl}/${table}`, row, {
        headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      })
      .pipe(map(rows => rows[0]));
  }

  update<T>(table: string, query: Query, changes: Partial<T>): Observable<T[]> {
    return this.http.patch<T[]>(`${this.baseUrl}/${table}`, changes, {
      headers: this.headers({ Prefer: 'return=representation' }),
      params: new HttpParams({ fromObject: query }),
    });
  }

  delete(table: string, query: Query): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${table}`, {
      headers: this.headers(),
      params: new HttpParams({ fromObject: query }),
    });
  }
}