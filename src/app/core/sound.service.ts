import { Injectable, signal } from '@angular/core';

const SOUND_KEY = 'whoami.sound';

interface Note {
    freq: number;
    at: number;
    length: number;
    volume?: number;
    type?: OscillatorType;
}

@Injectable({ providedIn: 'root' })
export class SoundService {
    readonly on = signal(read() !== 'off');

    private context: AudioContext | null = null;

    constructor() {
        // Browsers only allow sound after the player clicks or taps the page: get it ready on the first one.
        if (typeof document !== 'undefined') {
            const unlock = () => this.ready();
            document.addEventListener('pointerdown', unlock, { once: true, capture: true });
            document.addEventListener('keydown', unlock, { once: true, capture: true });
        }
    }

    toggle(): void {
        this.on.update(on => !on);
        write(this.on() ? 'on' : 'off');
        if (this.on()) this.ready();
    }

    voteNow(): void {
        this.play([{ freq: 660, at: 0, length: 0.12 }, { freq: 880, at: 0.13, length: 0.16 }]);
        this.vibrate([60, 40, 60]);
    }

    yourTurn(): void {
        this.play([{ freq: 523, at: 0, length: 0.14 }, { freq: 659, at: 0.14, length: 0.14 }, { freq: 784, at: 0.28, length: 0.26 }]);
        this.vibrate([120]);
    }

    tick(secondsLeft: number): void {
        this.play([{ freq: secondsLeft <= 3 ? 1200 : 950, at: 0, length: 0.05, volume: 0.12, type: 'square' }]);
    }

    correct(): void {
        this.play([523, 659, 784, 1047].map((freq, i) => ({ freq, at: i * 0.09, length: i === 3 ? 0.35 : 0.12 })));
    }

    private play(notes: Note[]): void {
        if (!this.on()) return;
        const ctx = this.ready();
        if (!ctx || ctx.state !== 'running') return;
        const start = ctx.currentTime + 0.02;
        for (const n of notes) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = n.type ?? 'sine';
            osc.frequency.value = n.freq;
            const t = start + n.at;
            const peak = (n.volume ?? 0.22);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(peak, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + n.length);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + n.length + 0.02);
        }
    }

    private ready(): AudioContext | null {
        try {
            const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctx) return null;
            this.context ??= new Ctx();
            if (this.context.state === 'suspended') this.context.resume().catch(() => undefined);
            return this.context;
        } catch {
            return null;
        }
    }

    private vibrate(pattern: number[]): void {
        if (this.on() && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate(pattern); } catch { /* vibration not allowed */ }
        }
    }
}

function read(): string | null {
    try { return localStorage.getItem(SOUND_KEY); } catch { return null; }
}

function write(value: string): void {
    try { localStorage.setItem(SOUND_KEY, value); } catch { /* storage blocked */ }
}
