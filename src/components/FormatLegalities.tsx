/**
 * Compact format legality display.
 *
 * Renders each format as a small pill/badge with the format name and a
 * colored status indicator — similar to the Scryfall / MTGGoldfish style:
 *
 *   [Commander ✓] [Modern ✓] [Standard ✗] [Legacy ✓] ...
 *
 * Legal statuses are colour-coded:
 *   - legal      → green
 *   - not legal  → grey
 *   - banned     → red
 *   - restricted → gold/amber
 */
const FORMAT_ORDER = [
  'standard',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'commander',
  'pauper',
  'historic',
  'frontier',
  'brawl',
  'duel',
  'oldschool',
] as const;

/** Human-readable labels for the format keys Scryfall returns. */
const FORMAT_LABELS: Record<string, string> = {
  standard: 'Standard',
  pioneer: 'Pioneer',
  modern: 'Modern',
  legacy: 'Legacy',
  vintage: 'Vintage',
  commander: 'Commander',
  pauper: 'Pauper',
  historic: 'Historic',
  frontier: 'Frontier',
  brawl: 'Brawl',
  duel: 'Duel',
  oldschool: 'Old School',
  future: 'Future',
  penny: 'Penny Dreadful',
  predh: 'Pre-Modern',
  alchemy: 'Alchemy',
  explorer: 'Explorer',
  gladiator: 'Gladiator',
  historicbrawl: 'Historic Brawl',
};

/** Icon + CSS class for each status type. */
function statusInfo(status: string): { icon: string; cls: string; label: string } {
  switch (status) {
    case 'legal':
      return { icon: '✓', cls: 'legal', label: 'Legal' };
    case 'not_legal':
      return { icon: '✗', cls: 'not-legal', label: 'Not Legal' };
    case 'banned':
      return { icon: '🚫', cls: 'banned', label: 'Banned' };
    case 'restricted':
      return { icon: '⚠', cls: 'restricted', label: 'Restricted' };
    default:
      return { icon: '·', cls: 'not-legal', label: status };
  }
}

export default function FormatLegalities({
  legalities,
}: {
  legalities: Record<string, string>;
}) {
  // Build a sorted list: known formats first (in FORMAT_ORDER), then any extras.
  const known = FORMAT_ORDER.filter((f) => legalities[f] != null);
  const extras = Object.keys(legalities)
    .filter((f) => !FORMAT_ORDER.includes(f as (typeof FORMAT_ORDER)[number]))
    .sort();
  const formats = [...known, ...extras];

  if (formats.length === 0) return null;

  return (
    <div className="card-detail-section">
      <p className="card-detail-section-title">📋 Format Legality</p>
      <div className="format-legalities">
        {formats.map((fmt) => {
          const status = legalities[fmt];
          const info = statusInfo(status);
          return (
            <span
              key={fmt}
              className={`format-legality-pill ${info.cls}`}
              title={`${FORMAT_LABELS[fmt] ?? fmt}: ${info.label}`}
            >
              <span className="format-legality-icon">{info.icon}</span>
              <span className="format-legality-name">
                {FORMAT_LABELS[fmt] ?? fmt}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}