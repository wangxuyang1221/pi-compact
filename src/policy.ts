export const defaultThresholdPercent = 90;

export function parseThreshold(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value >= 100) {
    throw new Error('Threshold must be a finite number greater than 0 and less than 100.');
  }
  return value;
}

export function thresholdTokens(contextWindow: number, percent: number): number {
  return Math.ceil(contextWindow * percent / 100);
}

export function nativeThresholdReserve(contextWindow: number, percent: number): number {
  return contextWindow - thresholdTokens(contextWindow, percent) + 1;
}
