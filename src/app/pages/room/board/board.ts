import {
    AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, ViewChild, signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Player, Whiteboard } from '../../../core/models';

export interface BoardDraft {
    image: string;
    shared: boolean;
}

type Tool = 'pen' | 'eraser';

const WIDTH = 1200;
const HEIGHT = 900;
const PEN_SIZE = 8;
const ERASER_SIZE = 44;
const UNDO_STEPS = 30;
const SAVE_DELAY_MS = 700;
const CHALKBOARD = '#0A3440';

interface Snapshot { pixels: ImageData; blank: boolean; }

@Component({
    selector: 'app-board',
    imports: [DatePipe],
    templateUrl: './board.html',
    styleUrl: './board.css',
})
export class Board implements OnChanges, AfterViewInit, OnDestroy {
    @Input({ required: true }) me!: Player;
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) boards: Whiteboard[] = [];
    @Input() open = false;

    @Output() save = new EventEmitter<BoardDraft>();
    @Output() closed = new EventEmitter<void>();

    @ViewChild('canvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

    protected readonly width = WIDTH;
    protected readonly height = HEIGHT;
    protected readonly colors = [
        { value: '#F4FBF9', label: 'White' },
        { value: '#FFC93C', label: 'Yellow' },
        { value: '#FF9A9A', label: 'Red' },
        { value: '#5CF2C2', label: 'Green' },
        { value: '#A8CBFF', label: 'Blue' },
    ];

    protected readonly tab = signal('me');
    protected readonly tool = signal<Tool>('pen');
    protected readonly color = signal(this.colors[1].value);
    protected readonly shared = signal(true);
    protected readonly canUndo = signal(false);
    protected readonly blank = signal(true);
    protected readonly saving = signal<'saved' | 'unsaved'>('saved');

    private context: CanvasRenderingContext2D | null = null;
    private undo: Snapshot[] = [];
    private drawing = false;
    private last: { x: number; y: number } | null = null;
    private loaded = false;
    private touched = false;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    ngAfterViewInit(): void {
        this.context = this.canvasRef?.nativeElement.getContext('2d') ?? null;
        this.loadMine();
    }

    ngOnChanges(): void {
        this.loadMine();
    }

    ngOnDestroy(): void {
        if (this.saveTimer) this.saveNow();
    }

    @HostListener('document:keydown.escape')
    protected onEscape(): void {
        if (this.open) this.closed.emit();
    }

    protected others(): Whiteboard[] {
        return this.boards.filter(b => b.player_id !== this.me.id && b.shared && b.image !== '');
    }

    protected boardOf(playerId: string): Whiteboard | null {
        return this.others().find(b => b.player_id === playerId) ?? null;
    }

    protected current(): string {
        return this.tab() === 'me' || this.boardOf(this.tab()) ? this.tab() : 'me';
    }

    protected nameOf(playerId: string): string {
        return this.players.find(p => p.id === playerId)?.name ?? 'Someone';
    }

    protected startStroke(event: PointerEvent): void {
        if (!this.context || event.button > 0) return;
        event.preventDefault();
        try {
            (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
        } catch {
            /* pointer capture not supported */
        }
        this.remember();
        this.drawing = true;
        this.touched = true;
        this.last = this.point(event);
        this.line(this.last, this.last);
    }

    protected moveStroke(event: PointerEvent): void {
        if (!this.drawing || !this.last) return;
        const points = event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event];
        for (const e of points) {
            const next = this.point(e);
            this.line(this.last, next);
            this.last = next;
        }
    }

    protected endStroke(): void {
        if (!this.drawing) return;
        this.drawing = false;
        this.last = null;
        this.blank.set(false);
        this.scheduleSave();
    }

    protected undoStep(): void {
        const step = this.undo.pop();
        if (!step || !this.context) return;
        this.context.putImageData(step.pixels, 0, 0);
        this.blank.set(step.blank);
        this.canUndo.set(this.undo.length > 0);
        this.scheduleSave();
    }

    protected clear(): void {
        if (!this.context || this.blank()) return;
        this.remember();
        this.context.clearRect(0, 0, WIDTH, HEIGHT);
        this.blank.set(true);
        this.scheduleSave();
    }

    protected pickColor(color: string): void {
        this.color.set(color);
        this.tool.set('pen');
    }

    protected toggleShared(): void {
        this.shared.update(on => !on);
        this.saveNow();
    }

    protected download(): void {
        const source = this.current() === 'me' ? this.canvasRef?.nativeElement.toDataURL('image/png') : this.boardOf(this.current())?.image;
        if (!source) return;
        const name = this.current() === 'me' ? 'my-board' : `${this.nameOf(this.current()).toLowerCase()}-board`;
        const image = new Image();
        image.onload = () => {
            const copy = document.createElement('canvas');
            copy.width = WIDTH;
            copy.height = HEIGHT;
            const context = copy.getContext('2d');
            if (!context) return;
            context.fillStyle = CHALKBOARD;
            context.fillRect(0, 0, WIDTH, HEIGHT);
            context.drawImage(image, 0, 0, WIDTH, HEIGHT);
            const link = document.createElement('a');
            link.href = copy.toDataURL('image/png');
            link.download = `whoami-${name}.png`;
            link.click();
        };
        image.src = source;
    }

    private point(event: PointerEvent): { x: number; y: number } {
        const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * WIDTH,
            y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
        };
    }

    private line(from: { x: number; y: number }, to: { x: number; y: number }): void {
        const context = this.context;
        if (!context) return;
        const erasing = this.tool() === 'eraser';
        context.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
        context.strokeStyle = this.color();
        context.lineWidth = erasing ? ERASER_SIZE : PEN_SIZE;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
    }

    private remember(): void {
        if (!this.context) return;
        this.undo.push({ pixels: this.context.getImageData(0, 0, WIDTH, HEIGHT), blank: this.blank() });
        if (this.undo.length > UNDO_STEPS) this.undo.shift();
        this.canUndo.set(true);
    }

    private scheduleSave(): void {
        this.saving.set('unsaved');
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DELAY_MS);
    }

    private saveNow(): void {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = null;
        const canvas = this.canvasRef?.nativeElement;
        if (!canvas) return;
        this.save.emit({ image: this.blank() ? '' : canvas.toDataURL('image/png'), shared: this.shared() });
        this.saving.set('saved');
    }

    private loadMine(): void {
        if (this.loaded || !this.context) return;
        const mine = this.boards.find(b => b.player_id === this.me.id);
        if (!mine) return;
        this.loaded = true;
        this.shared.set(mine.shared);
        if (this.touched || mine.image === '') return;
        const image = new Image();
        image.onload = () => {
            if (this.touched || !this.context) return;
            this.context.drawImage(image, 0, 0, WIDTH, HEIGHT);
            this.blank.set(false);
        };
        image.src = mine.image;
    }
}
