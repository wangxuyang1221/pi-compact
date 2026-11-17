import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

export const compactionLabel = '↗↙ Context compacted';
export type DividerPalette = { rule(text: string): string; caption(text: string): string };
const reset = '\x1b[0m';

export function renderCompactionDivider(width: number, palette: DividerPalette): string[] {
  const cells = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  const labelWidth = visibleWidth(compactionLabel);
  if (cells < labelWidth + 4) {
    const label = truncateToWidth(compactionLabel, cells, '');
    return ['', ' '.repeat(Math.floor((cells - visibleWidth(label)) / 2)) + palette.caption(label) + reset, ''];
  }
  const rules = cells - labelWidth - 4;
  const left = Math.floor(rules / 2);
  const right = rules - left;
  return ['', ' ' + palette.rule('─'.repeat(left)) + reset + ' ' +
    palette.caption(compactionLabel) + reset + ' ' + palette.rule('─'.repeat(right)) + ' ' + reset, ''];
}
