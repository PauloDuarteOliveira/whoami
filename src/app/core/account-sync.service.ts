import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { AuthService, playerName } from './auth.service';
import { PreferencesService, Sky } from './preferences.service';
import { ProfileService } from './profile.service';
import { RoomSettings } from './room.service';
import { SUPABASE } from './supabase.client';
import { isAvatar } from '../shared/avatars';

interface SavedProfile {
    name?: string;
    avatar?: string;
    sky?: Sky;
    room_settings?: RoomSettings;
}

@Injectable({ providedIn: 'root' })
export class AccountSync {
    private readonly client = inject(SUPABASE);
    private readonly auth = inject(AuthService);
    private readonly profile = inject(ProfileService);
    private readonly prefs = inject(PreferencesService);

    private pulledFor: string | null = null;

    readonly roomSettings = computed<RoomSettings | null>(() => {
        const user = this.auth.session()?.user;
        if (!user || user.is_anonymous) return null;
        return validRoomSettings((user.user_metadata as SavedProfile | undefined)?.room_settings);
    });

    constructor() {
        effect(() => {
            const user = this.auth.session()?.user;
            if (!user || user.is_anonymous) {
                this.pulledFor = null;
                return;
            }
            if (this.pulledFor === user.id) return;
            this.pulledFor = user.id;
            untracked(() => this.bringIn(user.user_metadata as SavedProfile));
        });

        effect(() => {
            const name = this.profile.name();
            const avatar = this.profile.avatar();
            const sky = this.prefs.sky();
            const user = this.auth.session()?.user;
            if (!user || user.is_anonymous || this.pulledFor !== user.id) return;
            const saved = (user.user_metadata ?? {}) as SavedProfile;
            const changes: Partial<SavedProfile> = {};
            if (name && saved.name !== name) changes.name = name;
            if (saved.avatar !== avatar) changes.avatar = avatar;
            if (saved.sky !== sky) changes.sky = sky;
            if (Object.keys(changes).length > 0) untracked(() => void this.save(changes));
        });
    }

    async saveRoomSettings(settings: RoomSettings): Promise<boolean> {
        if (this.auth.isAnonymous()) return false;
        return this.save({ room_settings: settings });
    }

    private bringIn(saved: SavedProfile): void {
        const name = playerName(saved.name ?? null) ?? (this.profile.name() ? null : playerName(this.auth.accountName()));
        if (name) this.profile.setName(name);
        if (isAvatar(saved.avatar)) this.profile.setAvatar(saved.avatar);
        if (saved.sky === 'day' || saved.sky === 'night') this.prefs.setSky(saved.sky);
    }

    private async save(data: Partial<SavedProfile>): Promise<boolean> {
        const { error } = await this.client.auth.updateUser({ data });
        return !error;
    }
}

function validRoomSettings(saved: RoomSettings | undefined): RoomSettings | null {
    if (!saved || typeof saved !== 'object') return null;
    const okMode = saved.mode === 'voice' || saved.mode === 'novoice';
    const okSource = saved.character_source === 'custom' || saved.character_source === 'deck' || saved.character_source === 'list';
    const okGiveUp = Number.isInteger(saved.give_up_after) && saved.give_up_after >= 1 && saved.give_up_after <= 99;
    const okTurn = saved.turn_timer_sec === null || [60, 120, 180].includes(saved.turn_timer_sec as number);
    const okWriting = saved.writing_timer_sec === null || [30, 60, 90].includes(saved.writing_timer_sec as number);
    return okMode && okSource && okGiveUp && okTurn && okWriting ? saved : null;
}
