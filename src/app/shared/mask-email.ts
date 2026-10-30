export function maskEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const at = email.lastIndexOf('@');
    if (at < 1) return '*****';
    const name = email.slice(0, at);
    const domain = email.slice(at);
    if (name.length <= 4) return `${name.charAt(0)}*****${domain}`;
    return `${name.slice(0, 2)}*****${name.slice(-2)}${domain}`;
}
