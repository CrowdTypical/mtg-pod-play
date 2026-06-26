import { useEffect, useState } from 'react';

import FormatLegalities from './FormatLegalities';
import { getCardPrints, getCardRulings } from '@/lib/scryfall';
import type { CommanderInfo, ScryfallCard, ScryfallRuling } from '@/types';

/**
 * Shared commander detail modal.
 *
 * Zooms in on a commander candidate, shows full details, lets the user
 * pick from alternate arts / printings, and provides a
 * "Choose This Commander" confirmation button.
 *
 * Used by both LobbyPage (host) and JoinPage (guest).
 */
export default function CommanderDetailModal({
  commander,
  onClose,
  onChoose,
}: {
  commander: CommanderInfo;
  onClose: () => void;
  onChoose: (c: CommanderInfo) => void;
}) {
  // Start with the clicked print, then load all other prints for art selection.
  const [prints, setPrints] = useState<ScryfallCard[]>([]);
  const [selectedPrint, setSelectedPrint] = useState<ScryfallCard | null>(null);
  const [loadingPrints, setLoadingPrints] = useState(true);

  // Card details (for legalities) and rulings for the selected print.
  const [rulings, setRulings] = useState<ScryfallRuling[]>([]);
  const [loadingRulings, setLoadingRulings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingPrints(true);
    (async () => {
      const all = await getCardPrints(commander.scryfallId);
      if (cancelled) return;
      setPrints(all);
      // Prefer the currently-shown print (matching by id) as the default selection.
      const match = all.find((p) => p.id === commander.scryfallId);
      setSelectedPrint(match ?? all[0] ?? null);
      setLoadingPrints(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [commander.scryfallId]);

  // Fetch rulings whenever the user selects a different print.
  useEffect(() => {
    if (!selectedPrint) return;
    let cancelled = false;
    setLoadingRulings(true);
    setRulings([]);
    (async () => {
      const r = await getCardRulings(selectedPrint.id);
      if (!cancelled) {
        setRulings(r);
        setLoadingRulings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPrint?.id]);

  // The art to display in the big preview pane.
  const displayImage =
    selectedPrint?.image_uris?.large ??
    selectedPrint?.image_uris?.normal ??
    commander.imageUris?.large ??
    commander.imageUris?.normal;

  const displaySet = selectedPrint
    ? `${selectedPrint.set_name ?? ''} (${(selectedPrint.set ?? '').toUpperCase()})`
    : '';

  // Oracle text comes from the selected print so alt-art / reprinted text matches.
  const oracleText =
    selectedPrint?.oracle_text ??
    selectedPrint?.card_faces?.map((f) => f.oracle_text).join('\n') ??
    '';

  /** Build a CommanderInfo from the chosen print and commit it. */
  function handleChoose() {
    const img = selectedPrint?.image_uris ?? selectedPrint?.card_faces?.[0]?.image_uris;
    const info: CommanderInfo = {
      scryfallId: selectedPrint?.id ?? commander.scryfallId,
      name: selectedPrint?.name ?? commander.name,
      manaCost: selectedPrint?.mana_cost ?? selectedPrint?.card_faces?.[0]?.mana_cost ?? commander.manaCost,
      typeLine: selectedPrint?.type_line ?? commander.typeLine,
      imageUris: img
        ? { small: img.small, normal: img.normal, large: img.large }
        : commander.imageUris,
      colors: selectedPrint?.color_identity ?? commander.colors,
      partner: commander.partner,
    };
    onChoose(info);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content commander-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{selectedPrint?.name ?? commander.name}</h3>
          <button onClick={onClose} className="btn btn-outline btn-sm">✕</button>
        </div>

        <div className="commander-detail-body">
          {/* Left: big art preview */}
          <div className="commander-detail-preview">
            {displayImage ? (
              <img src={displayImage} alt={commander.name} className="commander-detail-img" />
            ) : (
              <div className="commander-detail-img commander-detail-noimg">No Image</div>
            )}
            {displaySet && (
              <p className="text-muted" style={{ fontSize: '0.75rem', textAlign: 'center', marginTop: '0.4rem' }}>
                {displaySet}
              </p>
            )}
          </div>

          {/* Right: details + art selector */}
          <div className="commander-detail-info">
            {commander.manaCost && (
              <p className="card-detail-mana">{commander.manaCost}</p>
            )}
            <p className="text-muted card-detail-type">{commander.typeLine}</p>

            {oracleText && (
              <p className="card-detail-oracle" style={{ fontSize: '0.85rem' }}>
                {oracleText}
              </p>
            )}

            {/* Color identity */}
            <div className="commander-card-colors" style={{ marginBottom: '0.75rem' }}>
              {commander.colors.map((c) => (
                <span key={c} className={`mana-pill mana-${c.toLowerCase()}`} />
              ))}
            </div>

            {/* Art / printing selector */}
            <div className="commander-art-section">
              <p className="stat-label" style={{ marginBottom: '0.4rem' }}>
                🎨 Art / Edition {loadingPrints && <span className="text-muted">(loading…)</span>}
              </p>
              {!loadingPrints && prints.length === 0 && (
                <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Only one print available.
                </p>
              )}
              {prints.length > 0 && (
                <div className="commander-art-grid">
                  {prints.map((p) => {
                    const img = p.image_uris?.small ?? p.image_uris?.normal;
                    const isSelected = selectedPrint?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPrint(p)}
                        className={`commander-art-thumb ${isSelected ? 'commander-art-selected' : ''}`}
                        title={`${p.set_name} (${(p.set ?? '').toUpperCase()})`}
                      >
                        {img ? (
                          <img src={img} alt={`${p.set_name}`} />
                        ) : (
                          <div className="commander-art-noimg">?</div>
                        )}
                        <span className="commander-art-set">
                          {(p.set ?? '').toUpperCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Format Legalities */}
            {selectedPrint?.legalities && (
              <FormatLegalities legalities={selectedPrint.legalities} />
            )}

            {/* Rulings / Notes */}
            {(loadingRulings || rulings.length > 0) && (
              <div className="card-detail-section">
                <p className="card-detail-section-title">
                  📝 Rulings & Notes
                  {loadingRulings && <span className="text-muted" style={{ fontWeight: 400 }}> (loading…)</span>}
                </p>
                <div className="rulings-list">
                  {rulings.map((r) => (
                    <div key={r.oracle_id} className="ruling-item">
                      <div className="ruling-date">
                        {r.published_at}
                        <span className="ruling-source">{r.source}</span>
                      </div>
                      {r.comment}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Choose button */}
            <button
              onClick={handleChoose}
              className="btn btn-primary btn-lg btn-block"
              style={{ marginTop: '1rem' }}
            >
              ✓ Choose This Commander
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}