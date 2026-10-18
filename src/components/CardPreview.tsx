import React, { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { CardInput, clozeNumbers } from '../utils/flashcards';
import { maskGroups } from '../utils/occlusion';
import { CardImage } from './CardImage';
import { FlashcardText } from './FlashcardText';
import { t } from '../i18n';

/**
 * Aperçu d'une carte en cours de rédaction, rendu comme dans le lecteur : la question, puis la réponse au toucher.
 * Texte à trous : un choix par trou (une carte chacun) ; masques : un choix par groupe. Suit la saisie en direct.
 */
export const CardPreview: React.FC<{ card: CardInput; onClose: () => void }> = ({ card, onClose }) => {
  const options = card.kind === 'cloze' ? clozeNumbers(card.front) : card.kind === 'occlusion' ? maskGroups(card.masks ?? []) : [];
  const [revealed, setRevealed] = useState(false);
  const [active, setActive] = useState<number | undefined>(options[0]);

  // Le choix suit la liste : un trou ou un groupe qui disparaît ne doit pas laisser un aperçu vide
  useEffect(() => {
    if (options.length > 0 && (active === undefined || !options.includes(active))) setActive(options[0]);
    if (options.length === 0 && active !== undefined) setActive(undefined);
  }, [options.join(','), active]);

  const hasContent = !!card.front.trim() || !!card.frontImage || !!card.back?.trim() || !!card.backImage;

  return (
    <section
      aria-label={t('Aperçu de la carte')}
      className="rounded-xl border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-teal-100 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/30">
        <Eye className="w-4 h-4 text-teal-600 shrink-0" />
        <span className="text-xs font-bold text-teal-800 dark:text-teal-200 flex-1">{t('Aperçu de la carte')}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Fermer l\'aperçu')}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {options.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap px-3 pt-3" role="tablist">
          {options.map((n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={active === n}
              onClick={() => {
                setActive(n);
                setRevealed(false);
              }}
              className={`px-2.5 py-1 text-[0.6875rem] font-semibold rounded-md ${
                active === n ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {card.kind === 'cloze' ? t('Trou {n}', { n }) : t('Groupe {n}', { n })}
            </button>
          ))}
        </div>
      )}

      {hasContent ? (
        <div className="p-4 space-y-4 max-h-[55vh] overflow-y-auto">
          {card.front.trim() && (
            <FlashcardText
              text={card.front}
              cloze={card.kind === 'cloze'}
              clozeNumber={card.kind === 'cloze' ? active : undefined}
              revealed={revealed}
              className="block text-lg leading-relaxed text-slate-900 dark:text-slate-100"
            />
          )}
          {card.frontImage && (
            <div className="flex justify-center">
              <CardImage
                id={card.frontImage}
                maxHeight="max-h-[35vh]"
                occlusion={card.kind === 'occlusion' ? { masks: card.masks ?? [], mode: card.occlusionMode ?? 'hide-all', activeGroup: active, revealed } : undefined}
              />
            </div>
          )}
          {revealed && (card.back?.trim() || card.backImage) && (
            <>
              <hr className="border-slate-200 dark:border-slate-800" />
              {card.back?.trim() && (
                <FlashcardText text={card.back} className="block text-base leading-relaxed text-slate-700 dark:text-slate-300" />
              )}
              {card.backImage && (
                <div className="flex justify-center">
                  <CardImage id={card.backImage} maxHeight="max-h-[30vh]" />
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="p-4 text-xs text-slate-500 dark:text-slate-400">{t('Rien à afficher pour l\'instant : rédigez la carte.')}</p>
      )}

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="w-full py-2 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700"
        >
          {revealed ? t('Revenir à la question') : t('Afficher la réponse')}
        </button>
      </div>
    </section>
  );
};
