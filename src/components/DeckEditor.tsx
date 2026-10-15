import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, Check, EyeOff, FileUp, FolderInput, Layers, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Course, Deck, Flashcard, FlashcardKind, OcclusionMask, OcclusionMode, Subject } from '../types';
import {
  addCard,
  clozeNumbers,
  deleteCard,
  liveCards,
  MAX_CARD_TEXT,
  MAX_CARDS_PER_DECK,
  updateCard,
  validateCard,
  wrapCloze,
} from '../utils/flashcards';
import { CardImage } from './CardImage';
import { ImagePickerField, storeImageFile } from './ImagePickerField';
import { OcclusionEditor } from './OcclusionEditor';
import { getCourseEffectiveColor } from '../utils/colorUtils';
import { FlashcardText } from './FlashcardText';
import { useConfirm } from './ConfirmDialog';
import { plural, t } from '../i18n';
import { CardCoursePicker } from './CardCoursePicker';
import { isInboxCourse } from '../utils/inbox';

interface DeckEditorProps {
  course: Course;
  subject?: Subject;
  deck: Deck | undefined;
  /** Modification du paquet (enregistrée tout de suite, comme les liens du cours). */
  onChange: (change: (deck: Deck) => Deck) => void;
  onClose: () => void;
  /** Ouvre l'import CSV avec ce cours comme destination. */
  onImport?: () => void;
  /** Déplacement de cartes vers un autre cours (faux s'il a échoué). */
  courses?: Course[];
  subjects?: Subject[];
  onMove?: (toCourseId: string, cardIds: string[]) => boolean;
  /** Carte ouverte en modification à l'arrivée (résultat de recherche). */
  initialCardId?: string;
  /** « Cartes à trier » ouvertes pour ranger (bouton « Trier ») : le bouton « Ranger » est mis en évidence un instant. */
  highlightFiling?: boolean;
}

const FIELD =
  'w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/40 resize-y';

/** Rédaction des cartes d'un cours : formulaire en haut (ajout ou modification), liste en dessous. */
export const DeckEditor: React.FC<DeckEditorProps> = ({
  course,
  subject,
  deck,
  onChange,
  onClose,
  onImport,
  courses = [],
  subjects = [],
  onMove,
  initialCardId,
  highlightFiling = false,
}) => {
  const confirm = useConfirm();
  const [kind, setKind] = useState<FlashcardKind>('basic');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [frontImage, setFrontImage] = useState<string | undefined>();
  const [backImage, setBackImage] = useState<string | undefined>();
  const [masks, setMasks] = useState<OcclusionMask[]>([]);
  const [occlusionMode, setOcclusionMode] = useState<OcclusionMode>('hide-all');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [search, setSearch] = useState('');
  // Cartes cochées pour un déplacement vers un autre cours
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [moveTo, setMoveTo] = useState('');
  const frontRef = useRef<HTMLTextAreaElement>(null);

  const cards = liveCards(deck);
  const color = getCourseEffectiveColor(course, subject);
  const input = { kind, front, back, frontImage, backImage, masks, occlusionMode };
  const error = validateCard(input);
  const full = !editingId && cards.length >= MAX_CARDS_PER_DECK;
  const gaps = kind === 'cloze' ? clozeNumbers(front).length : 0;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...cards].reverse(); // les plus récentes d'abord
    return q ? list.filter((c) => `${c.front}\n${c.back ?? ''}`.toLowerCase().includes(q)) : list;
  }, [cards, search]);

  const resetForm = (keepKind = true) => {
    setFront('');
    setBack('');
    setFrontImage(undefined);
    setBackImage(undefined);
    setMasks([]);
    setPasteError(null);
    setEditingId(null);
    setShowError(false);
    if (!keepKind) setKind('basic');
    // Saisie en rafale pour le texte ; pour des masques le champ est facultatif : pas de clavier d'office
    if (!keepKind || kind !== 'occlusion') frontRef.current?.focus();
  };

  const submit = () => {
    if (error || full) {
      setShowError(true);
      return;
    }
    const now = new Date().toISOString();
    if (editingId) onChange((d) => updateCard(d, editingId, input, now));
    else onChange((d) => addCard(d, input, now));
    resetForm();
  };

  const startEdit = (card: Flashcard) => {
    setEditingId(card.id);
    setKind(card.kind);
    setFront(card.front);
    setBack(card.back ?? '');
    setFrontImage(card.frontImage);
    setBackImage(card.backImage);
    setMasks(card.masks ?? []);
    setOcclusionMode(card.occlusionMode ?? 'hide-all');
    setShowError(false);
    if (card.kind !== 'occlusion') frontRef.current?.focus();
  };

  // Dernière sélection du champ : sur iPad, toucher le bouton fait perdre la sélection avant le clic
  const lastSelection = useRef<{ start: number; end: number } | null>(null);
  const rememberSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const { selectionStart: start, selectionEnd: end } = e.currentTarget;
    if (start !== end) lastSelection.current = { start, end };
  };

  const hideSelection = () => {
    const el = frontRef.current;
    if (!el) return;
    const live = el.selectionStart !== el.selectionEnd ? { start: el.selectionStart, end: el.selectionEnd } : null;
    const range = live ?? lastSelection.current;
    if (!range) return;
    lastSelection.current = null;
    const wrapped = wrapCloze(front, range.start, range.end);
    if (!wrapped) return;
    setFront(wrapped.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(wrapped.cursor, wrapped.cursor);
    });
  };

  // Arrivée depuis un résultat de recherche : la carte est déjà dans le formulaire
  const openedInitial = useRef(false);
  useEffect(() => {
    if (openedInitial.current || !initialCardId) return;
    openedInitial.current = true;
    const card = cards.find((c) => c.id === initialCardId);
    if (card) startEdit(card);
    // une seule fois, à l'ouverture
  }, []);

  const liveSelected = cards.filter((c) => selected.has(c.id)).map((c) => c.id);
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const otherCourses = useMemo(
    () =>
      [...subjects]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({
          subject: s,
          list: courses.filter((c) => c.subjectId === s.id && c.id !== course.id).sort((a, b) => a.title.localeCompare(b.title)),
        }))
        .filter((g) => g.list.length > 0),
    [subjects, courses, course.id]
  );
  const moveSelected = () => {
    if (!onMove || !moveTo || liveSelected.length === 0) return;
    if (editingId && liveSelected.includes(editingId)) resetForm();
    if (onMove(moveTo, liveSelected)) setSelected(new Set());
  };

  // « Cartes à trier » : chaque carte se range d'un clic, en choisissant son cours dans l'arbre des cours
  const inbox = isInboxCourse(course);
  const [pickFor, setPickFor] = useState<string[] | null>(null);
  const [glow, setGlow] = useState(highlightFiling);
  useEffect(() => {
    if (!glow) return;
    const id = setTimeout(() => setGlow(false), 2500);
    return () => clearTimeout(id);
  }, [glow]);
  const fileCards = (toCourseId: string) => {
    const ids = pickFor ?? [];
    setPickFor(null);
    if (!onMove || ids.length === 0) return;
    if (editingId && ids.includes(editingId)) resetForm();
    if (!onMove(toCourseId, ids)) return;
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    // Tout est rangé : la boîte est vide, on la referme (le message garde « Annuler »)
    if (cards.every((c) => ids.includes(c.id))) onClose();
  };

  const remove = async (card: Flashcard) => {
    const ok = await confirm({
      title: t('Supprimer cette carte ?'),
      message: t('Son historique de révision sera perdu.'),
      confirmLabel: t('Supprimer'),
      tone: 'danger',
    });
    if (!ok) return;
    onChange((d) => deleteCard(d, card.id, new Date().toISOString()));
    if (editingId === card.id) resetForm();
  };

  // Coller une image (capture d'écran…) : image du recto si elle manque, sinon du verso
  const onPaste = async (e: React.ClipboardEvent) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    setPasteError(null);
    const id = await storeImageFile(file, setPasteError);
    if (!id) return;
    if (kind === 'occlusion' || !frontImage) setFrontImage(id);
    else setBackImage(id);
  };

  // Cmd/Ctrl + Entrée : ajoute la carte et repart sur une vierge (saisie en rafale)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const errorText =
    error === 'empty-front'
      ? kind === 'cloze' ? t('Écrivez le texte.') : t('Écrivez la question ou ajoutez une image.')
      : error === 'empty-back'
        ? t('Écrivez la réponse ou ajoutez une image.')
        : error === 'no-cloze'
          ? t('Cachez au moins un mot : sélectionnez-le puis « Cacher la sélection ».')
          : error === 'no-image'
            ? t('Ajoutez l\'image à masquer (photo ou fichier).')
            : error === 'no-mask'
              ? t('Masquez au moins une zone : glissez sur l\'image.')
              : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl my-6 overflow-hidden flex flex-col max-h-[calc(100dvh-3rem)]">
        <div className="h-2 w-full shrink-0" style={{ backgroundColor: color }} />

        {/* En-tête */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <Layers className="w-5 h-5 shrink-0" style={{ color }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">{t('Cartes · {title}', { title: course.title })}</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {plural(cards.length, '{n} carte', '{n} cartes')}
            </p>
          </div>
          {inbox && onMove && otherCourses.length > 0 && cards.length > 0 && (
            <button
              type="button"
              onClick={() => setPickFor(liveSelected.length > 0 ? liveSelected : cards.map((c) => c.id))}
              title={liveSelected.length > 0 ? t('Ranger les cartes cochées dans un cours') : t('Ranger toutes ces cartes dans un cours')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 shadow-xs transition-shadow ${
                glow ? 'ring-4 ring-teal-300/80 dark:ring-teal-500/60 animate-pulse' : ''
              }`}
            >
              <FolderInput className="w-4 h-4" />
              {liveSelected.length > 0 ? t('Ranger ({n})', { n: liveSelected.length }) : t('Tout ranger')}
            </button>
          )}
          {onImport && (
            <button
              type="button"
              onClick={onImport}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <FileUp className="w-3.5 h-3.5" />
              {t('Importer')}
            </button>
          )}
          <button
            type="button"
            aria-label={t('Fermer')}
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Formulaire */}
          <div className="p-5 space-y-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30" onKeyDown={onKeyDown} onPaste={onPaste}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900" role="tablist">
                {(['basic', 'cloze', 'occlusion'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={kind === k}
                    onClick={() => {
                      setKind(k);
                      setShowError(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      kind === k
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="phone:hidden">
                      {k === 'basic' ? t('Recto / verso') : k === 'cloze' ? t('Texte à trous') : t('Masques sur image')}
                    </span>
                    {/* Libellés courts sur téléphone : les trois onglets tiennent sur une ligne */}
                    <span className="hidden phone:inline">
                      {k === 'basic' ? t('Recto / verso') : k === 'cloze' ? t('Trous') : t('Masques')}
                    </span>
                  </button>
                ))}
              </div>
              {editingId && (
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">{t('Modification d\'une carte')}</span>
              )}
            </div>

            {kind === 'occlusion' && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('Image à masquer')}</span>
                <ImagePickerField
                  value={frontImage}
                  onChange={(id) => {
                    setFrontImage(id);
                    if (id !== frontImage) setMasks([]);
                  }}
                  label={t('Image à masquer')}
                  preview={false}
                  // Annoter garde les proportions de l'image : les masques déjà posés restent à leur place
                  onAnnotated={setFrontImage}
                  lockDrawWhenImage
                />
                {frontImage && <OcclusionEditor imageId={frontImage} masks={masks} onChange={setMasks} />}
                {frontImage && (
                  <div className="flex items-center gap-3 flex-wrap text-xs text-slate-700 dark:text-slate-300">
                    {(['hide-all', 'hide-one'] as const).map((m) => (
                      <label key={m} className="inline-flex items-center gap-1.5">
                        <input type="radio" name="occlusion-mode" checked={occlusionMode === m} onChange={() => setOcclusionMode(m)} />
                        {m === 'hide-all' ? t('Tout masquer, en deviner un') : t('Ne masquer que celui à deviner')}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-end justify-between gap-2">
                <label htmlFor="deck-front" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {kind === 'cloze' ? t('Texte') : kind === 'occlusion' ? t('Question (facultative)') : t('Recto (question)')}
                </label>
                {kind === 'cloze' && (
                  <button
                    type="button"
                    // garde la sélection du champ au clic
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={hideSelection}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-500/15 hover:bg-teal-100 dark:hover:bg-teal-500/25"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    {t('Cacher la sélection')}
                  </button>
                )}
              </div>
              <textarea
                id="deck-front"
                ref={frontRef}
                value={front}
                onChange={(e) => {
                  lastSelection.current = null;
                  setFront(e.target.value);
                }}
                onSelect={rememberSelection}
                maxLength={MAX_CARD_TEXT}
                rows={kind === 'occlusion' ? 1 : 3}
                className={FIELD}
                placeholder={
                  kind === 'cloze'
                    ? t('Les IEC sont contre-indiqués en cas de sténose bilatérale des artères rénales')
                    : kind === 'occlusion'
                      ? t('Nommez la structure masquée')
                      : t('Quel est le mécanisme d\'action des IEC ?')
                }
              />
              {kind !== 'occlusion' && <ImagePickerField value={frontImage} onChange={setFrontImage} label={t('Image du recto')} />}
              {kind === 'cloze' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {gaps > 0 ? (
                    <>
                      <FlashcardText text={front} cloze className="text-slate-700 dark:text-slate-300" />
                      <span className="block mt-1">
                        {plural(gaps, '{n} trou : {n} carte à réviser', '{n} trous : {n} cartes à réviser')}
                      </span>
                    </>
                  ) : (
                    t('Sélectionnez un mot puis « Cacher la sélection ». Chaque trou devient une carte.')
                  )}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="deck-back" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {kind === 'basic' ? t('Verso (réponse)') : t('Remarque (facultative, montrée avec la réponse)')}
              </label>
              <textarea
                id="deck-back"
                value={back}
                onChange={(e) => setBack(e.target.value)}
                maxLength={MAX_CARD_TEXT}
                rows={kind === 'basic' ? 3 : 2}
                className={FIELD}
              />
              {kind !== 'occlusion' && <ImagePickerField value={backImage} onChange={setBackImage} label={t('Image du verso')} />}
            </div>

            {pasteError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{pasteError}</p>}

            {showError && (errorText || full) && (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {full ? t('Ce cours a atteint {n} cartes, le maximum.', { n: MAX_CARDS_PER_DECK }) : errorText}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                {t('⌘/Ctrl + Entrée pour ajouter')}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {(editingId || front || back || frontImage || backImage) && (
                  <button
                    type="button"
                    onClick={() => resetForm()}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    {t('Annuler')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={submit}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
                >
                  {editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingId ? t('Enregistrer') : t('Ajouter la carte')}
                </button>
              </div>
            </div>
          </div>

          {/* Liste */}
          <div className="p-5 space-y-2">
            {cards.length > 8 && (
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('Rechercher dans les cartes')}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white"
                />
              </div>
            )}

            {onMove && cards.length > 0 && otherCourses.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-xs mb-1">
                {liveSelected.length === 0 ? (
                  <span className="text-slate-500 dark:text-slate-400">
                    {inbox
                      ? t('Rangez chaque carte avec « Ranger », ou cochez-en plusieurs et utilisez le bouton en haut.')
                      : t('Cochez des cartes pour les déplacer vers un autre cours.')}
                  </span>
                ) : inbox ? (
                  <>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {plural(liveSelected.length, '{n} sélectionnée', '{n} sélectionnées')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300 hover:underline"
                    >
                      {t('Désélectionner')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {plural(liveSelected.length, '{n} sélectionnée', '{n} sélectionnées')}
                    </span>
                    <select
                      value={moveTo}
                      onChange={(e) => setMoveTo(e.target.value)}
                      aria-label={t('Cours de destination')}
                      className="min-w-0 max-w-[16rem] flex-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">{t('— Choisir un cours —')}</option>
                      {otherCourses.map((g) => (
                        <optgroup key={g.subject.id} label={g.subject.name}>
                          {g.list.map((c) => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!moveTo}
                      onClick={moveSelected}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      {t('Déplacer')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300 hover:underline"
                    >
                      {t('Désélectionner')}
                    </button>
                  </>
                )}
                {shown.length > 0 && liveSelected.length < shown.length && (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set([...selected, ...shown.map((c) => c.id)]))}
                    className="ml-auto font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    {search.trim() ? t('Cocher les cartes trouvées') : t('Tout cocher')}
                  </button>
                )}
              </div>
            )}

            {cards.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                {t('Aucune carte pour ce cours. Écrivez la première ci-dessus.')}
              </p>
            )}
            {cards.length > 0 && shown.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">{t('Aucune carte ne correspond.')}</p>
            )}

            {shown.map((card) => (
              <div
                key={card.id}
                className={`group flex items-start gap-3 p-3 rounded-xl border ${
                  editingId === card.id
                    ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                {onMove && otherCourses.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selected.has(card.id)}
                    onChange={() => toggleSelected(card.id)}
                    aria-label={t('Sélectionner cette carte')}
                    className="mt-1 rounded shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  {card.front && (
                    <FlashcardText
                      text={card.front}
                      cloze={card.kind === 'cloze'}
                      className="block text-sm text-slate-900 dark:text-slate-100 line-clamp-4"
                    />
                  )}
                  {(card.frontImage || card.backImage) && (
                    <div className="flex items-start gap-2 flex-wrap">
                      {card.frontImage && (
                        <CardImage
                          id={card.frontImage}
                          maxHeight="max-h-24"
                          occlusion={card.kind === 'occlusion' ? { masks: card.masks ?? [], mode: card.occlusionMode ?? 'hide-all' } : undefined}
                        />
                      )}
                      {card.backImage && <CardImage id={card.backImage} maxHeight="max-h-24" className="opacity-80" />}
                    </div>
                  )}
                  {card.back && (
                    <FlashcardText
                      text={card.back}
                      className="block text-xs text-slate-500 dark:text-slate-400 line-clamp-3 border-t border-dashed border-slate-200 dark:border-slate-700 pt-1"
                    />
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {card.kind === 'cloze' && (
                    <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300 mr-1" title={t('Texte à trous')}>
                      {plural(clozeNumbers(card.front).length, '{n} trou', '{n} trous')}
                    </span>
                  )}
                  {card.kind === 'occlusion' && (
                    <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300 mr-1" title={t('Masques sur image')}>
                      {plural((card.masks ?? []).length, '{n} masque', '{n} masques')}
                    </span>
                  )}
                  {inbox && onMove && otherCourses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPickFor([card.id])}
                      title={t('Ranger cette carte dans un cours')}
                      className="inline-flex items-center gap-1 px-2 py-1 mr-1 text-[11px] font-bold rounded-lg text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-950/60"
                    >
                      <FolderInput className="w-3.5 h-3.5" />
                      {t('Ranger')}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={t('Modifier')}
                    onClick={() => startEdit(card)}
                    className="p-1.5 text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('Supprimer')}
                    onClick={() => remove(card)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Choix du cours où ranger : rendu dans body, le flou de l'arrière-plan piégerait une fenêtre fixe */}
      {pickFor &&
        createPortal(
          <CardCoursePicker
            courses={courses.filter((c) => c.id !== course.id)}
            subjects={subjects}
            title={plural(pickFor.length, 'Ranger {n} carte', 'Ranger {n} cartes')}
            subtitle={t('Dans quel cours ?')}
            onPick={fileCards}
            onClose={() => setPickFor(null)}
          />,
          document.body
        )}
    </div>
  );
};
