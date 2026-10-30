import { Component } from '@angular/core';

interface Frond { stem: string; leaves: string; }
interface Star { x: number; y: number; r: number; duration: string; delay: string; }

const W = 1440;
const H = 900;

@Component({
    selector: 'app-scenery',
    templateUrl: './scenery.html',
    styleUrl: './scenery.css',
    host: { 'aria-hidden': 'true' },
})
export class Scenery {
    protected readonly width = W;
    protected readonly height = H;
    protected readonly stars = makeStars();
    protected readonly leftPalm: Frond[] = [
        frond([-30, -20], [160, 40], [330, 210], 120, 14),
        frond([-30, -20], [60, 120], [120, 330], 110, 12, -1),
        frond([-30, -20], [230, -30], [430, 60], 100, 12),
    ];
    protected readonly rightPalm: Frond[] = [
        frond([1480, 940], [1300, 830], [1150, 650], 120, 14, -1),
        frond([1480, 940], [1420, 760], [1330, 560], 110, 12),
        frond([1480, 940], [1240, 930], [1050, 830], 100, 12, -1),
    ];
}

type Point = [number, number];

const round = (n: number) => Math.round(n * 10) / 10;

function frond(p0: Point, p1: Point, p2: Point, maxLeaf: number, count: number, side = 1): Frond {
    let leaves = '';
    for (let i = 1; i <= count; i++) {
        const t = i / (count + 1);
        const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
        const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
        const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
        const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
        const angle = Math.atan2(dy, dx);
        const length = maxLeaf * Math.pow(Math.sin(Math.PI * t), 0.6) + 12;
        for (const sign of [-1, 1]) {
            const a = angle + sign * 1.0 + 0.35 * side;
            const tipX = x + Math.cos(a) * length;
            const tipY = y + Math.sin(a) * length + length * 0.25;
            const midX = x + Math.cos(a) * length * 0.5;
            const midY = y + Math.sin(a) * length * 0.5;
            const nx = -Math.sin(a) * length * 0.09;
            const ny = Math.cos(a) * length * 0.09;
            leaves += `M${round(x)} ${round(y)} Q${round(midX + nx)} ${round(midY + ny)} ${round(tipX)} ${round(tipY)} `
                + `Q${round(midX - nx)} ${round(midY - ny)} ${round(x)} ${round(y)} Z `;
        }
    }
    return { stem: `M${p0[0]} ${p0[1]} Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`, leaves };
}

function makeStars(): Star[] {
    const random = seeded(11);
    return Array.from({ length: 70 }, () => ({
        x: round(random() * W),
        y: round(Math.pow(random(), 1.3) * H * 0.7),
        r: round(0.6 + Math.pow(random(), 2) * 1.6),
        duration: (2.4 + random() * 3.6).toFixed(1) + 's',
        delay: '-' + (random() * 5).toFixed(1) + 's',
    }));
}

function seeded(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
