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

export function lettersAndNumbers(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  if (value === '') {
    return null;
  }
  const words = value.split(' ');
  const valid = words.every(word => word.length > 0 && [...word].every(char => isLetter(char) || isDigit(char)));
  return valid ? null : { lettersAndNumbers: true };
}

export function roomCode(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  const valid = value.length === 4 && [...value].every(isCodeChar);
  return valid ? null : { roomCode: true };
}

export const playerNameValidators: ValidatorFn[] = [
  Validators.required,
  Validators.minLength(2),
  Validators.maxLength(16),
  lettersAndNumbers,
];

export const roomCodeValidators: ValidatorFn[] = [Validators.required, roomCode];