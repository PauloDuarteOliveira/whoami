/**
 * The avatars players pick from: 30 Twemoji animals (CC BY 4.0, see public/avatars/CREDITS.md).
 * A player's `avatar` is one of these ids; the picture is public/avatars/<id>.svg.
 */
export const AVATARS = [
  'dog', 'cat', 'mouse', 'hamster', 'rabbit', 'fox', 'bear', 'panda', 'koala', 'tiger',
  'lion', 'cow', 'pig', 'frog', 'monkey', 'chicken', 'penguin', 'chick', 'unicorn', 'wolf',
  'boar', 'horse', 'owl', 'octopus', 'whale', 'dinosaur', 'dragon', 'raccoon', 'hedgehog', 'butterfly',
] as const;

export type AvatarId = (typeof AVATARS)[number];

export function isAvatar(id: string | null | undefined): id is AvatarId {
  return !!id && (AVATARS as readonly string[]).includes(id);
}

/** Relative to the page's <base href>, so it works on localhost and on GitHub Pages. */
export function avatarUrl(id: string): string {
  return `avatars/${id}.svg`;
}

/** "fox" → "Fox", for labels read by screen readers. */
export function avatarLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** The avatar you asked for if it's free in the room, otherwise the first free one (or any, if all 30 are taken). */
export function freeAvatar(wanted: string | null, taken: (string | null)[]): AvatarId {
  if (isAvatar(wanted) && !taken.includes(wanted)) return wanted;
  return AVATARS.find(a => !taken.includes(a)) ?? AVATARS[taken.length % AVATARS.length];
}

export function randomAvatar(): AvatarId {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}
