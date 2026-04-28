import { HttpException, HttpStatus } from '@nestjs/common';

export function requireQueryParam(
  value: string | undefined,
  label: string,
): string {
  if (!value?.trim()) {
    throw new HttpException(
      `${label} is required`,
      HttpStatus.BAD_REQUEST,
    );
  }

  return value;
}

export function ensureEnumKey<T extends object>(
  enumLike: T,
  value: string,
  label: string,
): void {
  if (!Object.keys(enumLike).includes(value)) {
    throw new HttpException(`Invalid ${label}`, HttpStatus.BAD_REQUEST);
  }
}

export function validateOptionalEnumKey<T extends object>(
  enumLike: T,
  value: string | undefined,
  label: string,
): void {
  if (value && !Object.keys(enumLike).includes(value)) {
    throw new HttpException(`Invalid ${label}`, HttpStatus.BAD_REQUEST);
  }
}
