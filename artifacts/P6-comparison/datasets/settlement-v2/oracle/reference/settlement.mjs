export function settle(rows) {
  const seen = new Set(), totals = new Map();
  for (const r of rows) {
    if (r.status !== 'settled' || !Number.isInteger(r.cents) || r.cents < 0) continue;
    const key = JSON.stringify([r.tenant, r.event]);
    if (seen.has(key)) continue;
    seen.add(key); totals.set(r.tenant, (totals.get(r.tenant) ?? 0) + r.cents);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([tenant, cents]) => ({ tenant, cents }));
}
