/**
 * An email shown without giving it away: the first 2 and last 2 letters before the @, then the domain.
 * "example21@gmail.com" → "ex*****21@gmail.com". Always 5 stars, so it doesn't reveal the length either.
 */
export function maskEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const at = email.lastIndexOf('@');
    if (at < 1) return '*****';
    const name = email.slice(0, at);
    const domain = email.slice(at);
    if (name.length <= 4) return `${name.charAt(0)}*****${domain}`;
    return `${name.slice(0, 2)}*****${name.slice(-2)}${domain}`;
}
