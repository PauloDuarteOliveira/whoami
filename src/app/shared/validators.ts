import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

export function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

export function isLetter(char: string): boolean {
  return char.toLowerCase() !== char.toUpperCase();
}

export function isCodeChar(char: string): boolean {
  return (char >= 'A' && char <= 'Z') || isDigit(char);
}

export function cleanName(name: string): string {
  return name.split(' ').filter(word => word !== '').join(' ');
}

export function lettersAndNumbers(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  if (value === '') {
    return null;
  }
  const onlyAllowed = [...value].every(char => char === ' ' || isLetter(char) || isDigit(char));
  if (!onlyAllowed) {
    return { lettersAndNumbers: true };
  }
  const clean = cleanName(value);
  if (clean === '') {
    return { required: true };
  }
  if (clean.length < 2) {
    return { minlength: true };
  }
  return null;
}

export function roomCode(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  const valid = value.length === 4 && [...value].every(isCodeChar);
  return valid ? null : { roomCode: true };
}

export const playerNameValidators: ValidatorFn[] = [
  Validators.required,
  Validators.maxLength(16),
  lettersAndNumbers,
];

export const roomCodeValidators: ValidatorFn[] = [Validators.required, roomCode];