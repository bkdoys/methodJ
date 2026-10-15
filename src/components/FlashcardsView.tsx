import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileUp, Folder, Image as ImageIcon, Inbox, List, ListTree, Pencil, Play, Plus, Search, Shuffle } from 'lucide-react';
import { AppSettings, Course, Deck, Flashcard, Subject } from '../types';
import { CardCounts, courseCardCounts, getNewCardsPerDay, newCardsRoom, NEW_CARDS_PER_DAY_CHOICES } from '../utils/cardSession';
import { DeckScope, liveCards, searchCards } from '../utils/flashcards';
import { INBOX_COURSE_ID } from '../utils/inbox';
import { formatCoursePath, getChildFolders, resolveCourseFolderId } from '../utils/folders';
import { getFolderColor } from '../utils/folderColors';
import { getCourseEffectiveColor } from '../utils/colorUtils';
import { formatIsoDate } from '../utils/dateUtils';
import { Card } from './Card';
import { FlashcardText } from './FlashcardText';
import { plural, t } from '../i18n';

export type PlayKind = 'today' | 'all';

interface FlashcardsViewProps {
  courses: Course[];
  subjects: Subject[];
  decks: Record<string, Deck>;
  settings: AppSettings;
  onChangeSettings: (patch: Partial<AppSettings>) => void;
  /** Lance une séance : cartes du jour, ou toutes les cartes (révision libre si `cram`). */
  onPlay: (scope: DeckScope, kind: PlayKind, cram: boolean) => void;
  /** Éditeur des cartes d'un cours, ouvert sur une carte si `cardId` est donné. */
  onOpenDeck: (courseId: string, cardId?: string) => void;
  /** Import CSV (Anki, tableur). */
  onImport: () => void;
  /** Ajout d'une carte : le cours est choisi ensuite. */
  onAddCard: () => void;
}

interface TreeNode {
  key: string;
  scope: DeckScope;
  label: string;
  color: string;
  kind: 'subject' | 'folder' | 'course';
  counts: CardCounts;
  children: TreeNode[];
  courseId?: string;
}

const CRAM_KEY = 'medj_cards_cram_v1';
const LAYOUT_KEY = 'medj_cards_layout_v1';
/** Cartes montrées par cours dans les résultats de recherche (le reste : ouvrir le cours). */
const MAX_MATCHES = 5;

type Layout = 'tree' | 'flat';

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'flat' ? 'flat' : 'tree';
  } catch {
    return 'tree';
  }
}

function readCram(): boolean {
  try {
    return localStorage.getItem(CRAM_KEY) !== '0';
  } catch {
    return true;
  }
}

function addCounts(list: CardCounts[]): CardCounts {
  return list.reduce((a, c) => ({ total: a.total + c.total, due: a.due + c.due, fresh: a.fresh + c.fresh }), {
    total: 0,
    due: 0,
    fresh: 0,
  });
}

const sum = (nodes: TreeNode[]) => addCounts(nodes.map((n) => n.counts));

/** Arbre discipline > dossier > sous-dossier > cours, limité aux branches qui ont des cartes. */
function buildTree(subjects: Subject[], courses: Course[], counts: Record<string, CardCounts>): TreeNode[] {
  const courseNodes = (list: Course[], subject: Subject): TreeNode[] =>
    list
      .filter((c) => counts[c.id])
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((c) => ({
        key: `c:${c.id}`,
        scope: { kind: 'course', courseId: c.id },
        label: c.title,
        color: getCourseEffectiveColor(c, subject),
        kind: 'course',
        counts: counts[c.id],
        children: [],
        courseId: c.id,
      }));

  return subjects
    .map((subject) => {
      const own = courses.filter((c) => c.subjectId === subject.id);
      const inFolder = (folderId: string | undefined) => own.filter((c) => resolveCourseFolderId(c, subject) === folderId);
      const folderNode = (folderId: string, name: string): TreeNode => {
        const children = [
          ...getChildFolders(subject, folderId).map((f) => folderNode(f.id, f.name)),
          ...courseNodes(inFolder(folderId), subject),
        ].filter((n) => n.counts.total > 0);
        return {
          key: `f:${folderId}`,
          scope: { kind: 'subject', subjectId: subject.id, folderId },
          label: name,
          color: getFolderColor(subject, folderId) ?? subject.color,
          kind: 'folder',
          counts: sum(children),
          children,
        };
      };
      const children = [
        ...getChildFolders(subject).map((f) => folderNode(f.id, f.name)),
        ...courseNodes(inFolder(undefined), subject),
      ].filter((n) => n.counts.total > 0);
      const node: TreeNode = {
        key: `s:${subject.id}`,
        scope: { kind: 'subject', subjectId: subject.id },
        label: subject.name,
        color: subject.color,
        kind: 'subject',
        counts: sum(children),
        children,
      };
      return node;
    })
    .filter((n) => n.counts.total > 0);
}

/** Branches qui mènent à un cours ayant des cartes trouvées (les nœuds gardés gardent leurs compteurs complets). */
function pruneTree(nodes: TreeNode[], found: Record<string, unknown>): TreeNode[] {
  return nodes.flatMap((n) => {
    if (n.kind === 'course') return found[n.courseId!] ? [n] : [];
    const children = pruneTree(n.children, found);
    return children.length > 0 ? [{ ...n, children }] : [];
  });
}

const btnToday =
  'inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const btnAll =
  'inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors';

/** Vue « Cartes » : cartes du jour, et révision par discipline, dossier ou cours. */
export const FlashcardsView: React.FC<FlashcardsViewProps> = ({
  courses,
  subjects,
  decks,
  settings,
  onChangeSettings,
  onPlay,
  onOpenDeck,
  onImport,
  onAddCard,
}) => {
  const [cram, setCram] = useState(readCram);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [query, setQuery] = useState('');
  const newPerDay = getNewCardsPerDay(settings);

  const { tree, counts, room } = useMemo(() => {
    const now = new Date();
    const c = courseCardCounts(decks, now);
    // Seuls les paquets de cours encore présents comptent
    const known = new Set(courses.map((x) => x.id));
    Object.keys(c).forEach((id) => !known.has(id) && delete c[id]);
    return {
      tree: buildTree(subjects, courses, c),
      counts: addCounts(Object.values(c)),
      room: newCardsRoom(decks, formatIsoDate(now), newPerDay),
    };
  }, [decks, courses, subjects, newPerDay]);

  // Vue à plat : tous les cours qui ont des cartes, par titre, avec leur chemin (discipline / dossier)
  const flat = useMemo(() => {
    const leaves: TreeNode[] = [];
    const walk = (list: TreeNode[]) => list.forEach((n) => (n.kind === 'course' ? leaves.push(n) : walk(n.children)));
    walk(tree);
    const courseOf = new Map(courses.map((c) => [c.id, c]));
    const subjectOf = new Map(subjects.map((s) => [s.id, s]));
    return leaves
      .map((node) => {
        const course = courseOf.get(node.courseId!)!;
        const subject = subjectOf.get(course.subjectId);
        return { node, path: formatCoursePath(subject, resolveCourseFolderId(course, subject), 60).text };
      })
      .sort((a, b) => a.node.label.localeCompare(b.node.label, undefined, { numeric: true }));
  }, [tree, courses, subjects]);
  const searching = query.trim().length > 0;
  const matches = useMemo(() => searchCards(decks, query), [decks, query]);
  const flatShown = searching ? flat.filter((f) => matches[f.node.courseId!]) : flat;
  const treeShown = searching ? pruneTree(tree, matches) : tree;
  const matchTotal = Object.values(matches).reduce((n, list) => n + list.length, 0);

  const changeLayout = (value: Layout) => {
    setLayout(value);
    try {
      localStorage.setItem(LAYOUT_KEY, value);
    } catch {
      // préférence de cet appareil seulement
    }
  };

  const todayCount = (c: CardCounts) => c.due + Math.min(c.fresh, room);

  const toggleCram = (value: boolean) => {
    setCram(value);
    try {
      localStorage.setItem(CRAM_KEY, value ? '1' : '0');
    } catch {
      // préférence de cet appareil seulement
    }
  };

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderMatches = (courseId: string, list: Flashcard[]) => (
    <div className="pb-2 pl-9 pr-1 space-y-1">
      {list.slice(0, MAX_MATCHES).map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onOpenDeck(courseId, card.id)}
          className="w-full text-left rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-500/50 hover:bg-teal-50/50 dark:hover:bg-teal-500/5"
        >
          {card.front ? (
            <FlashcardText
              text={card.front}
              cloze={card.kind === 'cloze'}
              className="block text-sm text-slate-900 dark:text-slate-100 line-clamp-2"
            />
          ) : (
            <span className="text-sm text-slate-500 dark:text-slate-400">{t('Masques sur image')}</span>
          )}
          {card.back && (
            <FlashcardText text={card.back} className="block text-xs text-slate-500 dark:text-slate-400 line-clamp-1" />
          )}
          {(card.frontImage || card.backImage) && (
            <ImageIcon className="inline w-3.5 h-3.5 mt-0.5 text-slate-400" aria-label={t('Image')} />
          )}
        </button>
      ))}
      {list.length > MAX_MATCHES && (
        <button
          type="button"
          onClick={() => onOpenDeck(courseId)}
          className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
        >
          {t('+ {n} autres dans ce cours', { n: list.length - MAX_MATCHES })}
        </button>
      )}
    </div>
  );

  const renderNode = (node: TreeNode, depth: number, path?: string): React.ReactNode => {
    const expanded = searching || open.has(node.key);
    const today = todayCount(node.counts);
    return (
      <div key={node.key}>
        <div
          className="flex items-center gap-2 py-2 pr-1 border-b border-slate-100 dark:border-slate-800/80"
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(node.key)}
              aria-label={expanded ? t('Replier') : t('Déplier')}
              aria-expanded={expanded}
              className="p-1 -ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-6 shrink-0" />
          )}
          {node.kind === 'folder' ? (
            <Folder className="w-4 h-4 shrink-0" style={{ color: node.color }} />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
          )}
          <div className="flex-1 min-w-0">
            {node.courseId ? (
              <button
                type="button"
                onClick={() => onOpenDeck(node.courseId!)}
                className="group flex items-center gap-1 max-w-full text-left text-sm text-slate-900 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-300"
                title={t('Modifier les cartes')}
              >
                <span className="truncate phone:whitespace-normal phone:line-clamp-2">{node.label}</span>
                <Pencil className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toggle(node.key)}
                className={`block max-w-full truncate phone:whitespace-normal phone:line-clamp-2 text-left text-sm ${node.kind === 'subject' ? 'font-bold' : 'font-semibold'} text-slate-900 dark:text-slate-100`}
              >
                {node.label}
              </button>
            )}
            {path && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{path}</p>}
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {plural(node.counts.total, '{n} carte', '{n} cartes')}
              {node.counts.due > 0 && <> · <span className="text-amber-700 dark:text-amber-400 font-semibold">{t('{n} à revoir', { n: node.counts.due })}</span></>}
              {node.counts.fresh > 0 && <> · {plural(node.counts.fresh, '{n} nouvelle', '{n} nouvelles')}</>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={today === 0}
              onClick={() => onPlay(node.scope, 'today', false)}
              className={btnToday}
              title={t('Cartes du jour')}
            >
              <Play className="w-3 h-3 fill-current" />
              {today}
            </button>
            <button
              type="button"
              onClick={() => onPlay(node.scope, 'all', cram)}
              className={btnAll}
              title={cram ? t('Toutes les cartes, mélangées (révision libre : la programmation ne change pas)') : t('Toutes les cartes, mélangées (les réponses programment les prochaines révisions)')}
            >
              <Shuffle className="w-3 h-3" />
              <span className="phone:hidden">{t('Tout')}</span>
            </button>
          </div>
        </div>
        {searching && node.courseId && matches[node.courseId] && renderMatches(node.courseId, matches[node.courseId])}
        {expanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const totalToday = todayCount(counts);
  // Cartes créées sans cours (« Cartes à trier ») : hors de l'arbre, rappelées ici tant qu'il en reste
  const inboxDeck = courses.some((c) => c.id === INBOX_COURSE_ID) ? decks[INBOX_COURSE_ID] : undefined;
  const inboxCards = inboxDeck ? liveCards(inboxDeck).length : 0;

  return (
    <div className="min-w-0 grid gap-4 lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)] items-start">
      <Card
        title={t('Cartes du jour')}
        className="lg:sticky lg:top-4"
      >
        {counts.total === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('Aucune carte pour l\'instant. Utilisez « Ajouter une carte », ou ouvrez un cours (onglet Cours) et choisissez « Créer des cartes ».')}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white">{t('{n} à revoir', { n: counts.due })}</span>
              {' · '}
              {plural(Math.min(counts.fresh, room), '{n} nouvelle', '{n} nouvelles')}
              {counts.fresh > room && (
                <span className="text-slate-500 dark:text-slate-400"> {t('(sur {n})', { n: counts.fresh })}</span>
              )}
            </p>
            <button
              type="button"
              disabled={totalToday === 0}
              onClick={() => onPlay({ kind: 'all' }, 'today', false)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            >
              <Play className="w-4 h-4 fill-current" />
              {totalToday > 0 ? t('Réviser les cartes du jour ({n})', { n: totalToday }) : t('Rien à réviser aujourd\'hui')}
            </button>
          </div>
        )}
        <label className="flex items-center justify-between gap-2 pt-1 text-xs text-slate-600 dark:text-slate-400">
          {t('Nouvelles cartes par jour')}
          <select
            value={newPerDay}
            onChange={(e) => onChangeSettings({ cardsNewPerDay: Number(e.target.value) })}
            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white"
          >
            {[...new Set([...NEW_CARDS_PER_DAY_CHOICES, newPerDay])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {inboxCards > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <Inbox className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />
            <span className="flex-1 min-w-0 text-xs text-slate-700 dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white">{t('Cartes à trier')}</span>
              {' · '}
              {plural(inboxCards, '{n} carte', '{n} cartes')}
            </span>
            <button
              type="button"
              onClick={() => onPlay({ kind: 'course', courseId: INBOX_COURSE_ID }, 'all', cram)}
              title={t('Réviser les cartes à trier')}
              aria-label={t('Réviser les cartes à trier')}
              className="p-1.5 rounded-lg text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
            <button
              type="button"
              onClick={() => onOpenDeck(INBOX_COURSE_ID)}
              title={t('Ranger ces cartes dans un cours')}
              className="px-2 py-1 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              {t('Trier')}
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onAddCard}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Ajouter une carte')}
          </button>
          <button
            type="button"
            onClick={onImport}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <FileUp className="w-3.5 h-3.5" />
            {t('Importer')}
          </button>
        </div>
      </Card>

      {tree.length > 0 && (
        <Card
          title={layout === 'flat' ? t('Tous les cours') : t('Par discipline et dossier')}
          aside={
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900 shrink-0" role="group" aria-label={t('Affichage')}>
              {(['tree', 'flat'] as const).map((l) => {
                const Icon = l === 'tree' ? ListTree : List;
                const label = l === 'tree' ? t('Par dossier') : t('À plat');
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={layout === l}
                    aria-label={label}
                    title={label}
                    onClick={() => changeLayout(l)}
                    className={`p-1.5 rounded-md transition-colors ${
                      layout === l ? 'bg-teal-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          }
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('Rechercher dans les questions et les réponses')}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/40"
                />
              </div>
              <button
                type="button"
                aria-pressed={cram}
                onClick={() => toggleCram(!cram)}
                title={
                  cram
                    ? t('« Tout » en révision libre : vos réponses ne changent pas la programmation. Touchez pour programmer.')
                    : t('« Tout » programme les prochaines révisions d\'après vos réponses. Touchez pour réviser librement.')
                }
                className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-2 text-[11px] font-semibold rounded-lg border ${
                  cram
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                {cram ? t('Tout : libre') : t('Tout : programmé')}
              </button>
            </div>
            {searching && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {matchTotal > 0
                  ? t('{cards} dans {courses}', {
                      cards: plural(matchTotal, '{n} carte trouvée', '{n} cartes trouvées'),
                      courses: plural(flatShown.length, '{n} cours', '{n} cours'),
                    })
                  : t('Aucune carte ne correspond.')}
              </p>
            )}
            <div className={`-mx-1 ${layout === 'flat' ? 'xl:grid xl:grid-cols-2 xl:gap-x-4' : ''}`}>
              {layout === 'tree'
                ? treeShown.map((node) => renderNode(node, 0))
                : flatShown.map((f) => renderNode(f.node, 0, f.path))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
