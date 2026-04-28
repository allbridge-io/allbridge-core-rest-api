import 'dotenv/config';

export function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value) {
    if (defaultValue) {
      return defaultValue;
    } else {
      throw Error(`Environment variable ${name} is not defined!`);
    }
  }
  return value;
}

export function getJsonEnvVar<T>(name: string): T {
  const value = getEnvVar(name);

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw Error(
      `Environment variable ${name} must contain valid JSON: ${(error as Error).message}`,
    );
  }
}
