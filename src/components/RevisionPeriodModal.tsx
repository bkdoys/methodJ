import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Folder,
  Minus,
  Plus,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AppSettings, Course, RevisionItem, RevisionPeriod, Subject } from '../types';
import { plural, t } from '../i18n';
import { buildCourseTree, CourseTreeNode, filterCourseTree } from '../utils/courseTree';
import { addDays, diffInDays, formatFrenchDate, formatFrenchDayShort, formatMinutes } from '../utils/dateUtils';
import { DEFAULT_HOUR_HEIGHT, stepHourHeight, weekdayIndex } from '../utils/dayLayout';
import { getCourseEffectiveColor, getSubject } from '../utils/colorUtils';
import { isFreeCourse } from '../utils/jMethod';
import {
  clampPasses,
  DEFAULT_PERIOD_SLOT_MINUTES,
  defaultPasses,
  estimateNeed,
  MAX_PERIOD_HOURS,
  netWindowMinutes,
  overlappingPeriods,
  PeriodInput,
  PeriodPlan,
  PeriodSuggestion,
  planRevisionPeriod,
  usualDayWindows,
} from '../utils/revisionPeriod';
import { MultiDayTimeline } from './MultiDayTimeline';
import { FreeCourseBadge } from './FreeCourseBadge';
import { PlanningRules } from './PlanningRules';

interface RevisionPeriodModalProps {
  courses: Course[];
  subjects: Subject[];
  revisions: RevisionItem[];
  settings: AppSettings;
  todayIso: string;
  onApply: (period: RevisionPeriod, plan: PeriodPlan) => void;
  onClose: () => void;
}

type Windows = Record<string, { start: string; end: string }>;
type Step = 1 | 2 | 3;

const WEEKDAYS = ['0', '1', '2', '3', '4', '5', '6'];
const weekdayLabel = (w: string) => formatFrenchDayShort(addDays('2026-01-05', Number(w))).split(' ')[0];
const DURATIONS = [30, 45, 60, 90, 120];

const inputCls =
  'px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800 dark:text-white';
const btnCls =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost = `${btnCls} text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700`;
const btnPrimary = `${btnCls} text-white bg-teal-600 border-teal-600 hover:bg-teal-700`;

/** Ids des cours sous un nœud de l'arbre. */
function courseIdsUnder(node: CourseTreeNode): string[] {
  return node.courseId ? [node.courseId] : node.children.flatMap(courseIdsUnder);
}

/**
 * Assistant « Période de révision » : choix des cours, des dates et des contraintes, puis aperçu complet.
 * Tout est simulé : rien n'est modifié (planning, cours, réglages, cloud) avant « Planifier ».
 */
export const RevisionPeriodModal: React.FC<RevisionPeriodModalProps> = ({ courses, subjects, revisions, settings, todayIso, onApply, onClose }) => {
  const [step, setStep] = useState<Step>(1);
  const [periodId] = useState(() => `period_${Date.now().toString(36)}`);

  // Étape 1 : cours
  const tree = useMemo(() => buildCourseTree(subjects, courses), [subjects, courses]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const shown = useMemo(() => filterCourseTree(tree, query), [tree, query]);

  // Étape 2 : période et contraintes (préremplies depuis les réglages habituels)
  const defaultEnd = settings.examDate && settings.examDate > todayIso ? addDays(settings.examDate, -1) : addDays(todayIso, 20);
  const [name, setName] = useState(() => t('Révisions avant l\'examen'));
  const [start, setStart] = useState(todayIso);
  const [end, setEnd] = useState(defaultEnd);
  const [windows, setWindows] = useState<Windows>(() => usualDayWindows(settings));
  const [breaks, setBreaks] = useState<{ start: string; end: string }[]>(() => settings.breaks?.all ?? []);
  const [targetHours, setTargetHours] = useState<number>(settings.dailyTargetHours);
  const [duration, setDuration] = useState(DEFAULT_PERIOD_SLOT_MINUTES);

  // Étape 3 : passages et répartition
  const [passes, setPasses] = useState<Record<string, number>>({});
  const [seed, setSeed] = useState(1);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [hourHeight, setHourHeight] = useState(Math.round(DEFAULT_HOUR_HEIGHT / 2));

  const chosenCourses = useMemo(() => courses.filter((c) => selected.has(c.id)), [courses, selected]);
  const period: RevisionPeriod = useMemo(
    () => ({
      id: periodId,
      name: name.trim() || t('Période de révision'),
      start,
      end,
      courseIds: [...selected],
      dayWindows: windows,
      breaks,
      targetHours,
      createdAt: todayIso,
    }),
    [periodId, name, start, end, selected, windows, breaks, targetHours, todayIso]
  );
  const effectivePasses = useMemo(
    () => Object.fromEntries(chosenCourses.map((c) => [c.id, passes[c.id] ?? defaultPasses(c.mastery)])),
    [chosenCourses, passes]
  );
  const input: PeriodInput = useMemo(
    () => ({ courses, subjects, revisions, settings, period, passes: effectivePasses, durationMinutes: duration, seed, todayIso }),
    [courses, subjects, revisions, settings, period, effectivePasses, duration, seed, todayIso]
  );

  const datesValid = start <= end && end >= todayIso;
  const overlaps = useMemo(() => overlappingPeriods(settings, period), [settings, period]);
  const canPlan = selected.size > 0 && datesValid && overlaps.length === 0;
  const need = useMemo(() => (canPlan && step >= 2 ? estimateNeed(input) : null), [canPlan, step, input]);
  const plan = useMemo(() => (canPlan && step === 3 ? planRevisionPeriod(input) : null), [canPlan, step, input]);

  const applySuggestion = (s: PeriodSuggestion) => {
    setWindows(s.dayWindows);
    setTargetHours(s.hours);
    if (s.kind === 'extend') {
      setStart(s.start);
      setEnd(s.end);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Étape 1 : arbre à cocher
  // ---------------------------------------------------------------------------------------------

  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const renderNode = (node: CourseTreeNode, depth: number): React.ReactNode => {
    const ids = courseIdsUnder(node);
    const count = ids.filter((id) => selected.has(id)).length;
    const state = count === 0 ? 'none' : count === ids.length ? 'all' : 'some';
    const pad = { paddingLeft: `${0.25 + depth * 1.1}rem` };
    const box = (
      <span
        aria-hidden="true"
        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
          state === 'none' ? 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800' : 'border-teal-600 bg-teal-600 text-white'
        }`}
      >
        {state === 'all' && <Check className="w-3 h-3" strokeWidth={3} />}
        {state === 'some' && <Minus className="w-3 h-3" strokeWidth={3} />}
      </span>
    );
    if (node.courseId) {
      const c = courses.find((x) => x.id === node.courseId);
      return (
        <label key={node.key} style={pad} className="flex items-center gap-2 py-1.5 pr-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
          <input type="checkbox" className="sr-only" checked={state === 'all'} onChange={(e) => setMany(ids, e.target.checked)} />
          <span className="w-4 shrink-0" />
          {box}
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
          <span className="min-w-0 flex-1 break-words text-sm text-slate-900 dark:text-slate-100">{node.label}</span>
          {c && isFreeCourse(c) && <FreeCourseBadge />}
          {c && c.mastery > 0 && <span className="text-[11px] text-amber-500 shrink-0">{'★'.repeat(c.mastery)}</span>}
        </label>
      );
    }
    const expanded = query.trim().length > 0 || openKeys.has(node.key);
    return (
      <div key={node.key}>
        <div style={pad} className="flex items-center gap-2 py-1.5 pr-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? t('Replier') : t('Déplier')}
            onClick={() =>
              setOpenKeys((prev) => {
                const next = new Set(prev);
                if (next.has(node.key)) next.delete(node.key);
                else next.add(node.key);
                return next;
              })
            }
            className="w-4 shrink-0 text-slate-400"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
            <input type="checkbox" className="sr-only" checked={state === 'all'} onChange={(e) => setMany(ids, e.target.checked)} />
            {box}
            {node.kind === 'folder' ? (
              <Folder className="w-4 h-4 shrink-0" style={{ color: node.color }} />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
            )}
            <span className={`min-w-0 flex-1 break-words text-sm text-slate-900 dark:text-slate-100 ${node.kind === 'subject' ? 'font-bold' : 'font-semibold'}`}>
              {node.label}
            </span>
            <span className="text-[11px] font-mono text-slate-400 shrink-0">
              {count > 0 ? `${count}/${ids.length}` : ids.length}
            </span>
          </label>
        </div>
        {expanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const stepCourses = (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="px-5 pt-4 shrink-0 space-y-2">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {t('Cochez les cours à revoir. Ceux en méthode des J passeront en révision libre : leurs J à venir seront remplacés par les révisions de la période, les révisions faites sont gardées.')}
        </p>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Rechercher un cours')}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/40"
          />
        </div>
      </div>
      <div className="overflow-y-auto flex-1 px-3 py-2">
        {shown.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">{t('Aucun cours ne correspond.')}</p>
        ) : (
          shown.map((n) => renderNode(n, 0))
        )}
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------------------------
  // Étape 2 : dates et contraintes
  // ---------------------------------------------------------------------------------------------

  const needBanner = need && (
    <div
      className={`p-3 rounded-xl border text-xs space-y-2 ${
        need.fits
          ? 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200'
          : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
      }`}
    >
      <p className="font-semibold flex items-center gap-1.5">
        {need.fits ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
        {t('Besoin : {need} · disponible : {free} sur {days}', {
          need: formatMinutes(need.needMinutes),
          free: formatMinutes(need.freeMinutes),
          days: plural(need.days, '{n} jour', '{n} jours'),
        })}
      </p>
      {!need.fits && need.suggestion?.kind === 'hours' && (
        <div className="flex flex-wrap items-center gap-2">
          <span>{t('Avec les horaires habituels, ça ne rentre pas.')}</span>
          <button type="button" className={btnGhost} onClick={() => applySuggestion(need.suggestion!)}>
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            {t('Passer à {h} h/jour ({start}–{end})', {
              h: need.suggestion.hours,
              start: need.suggestion.dayWindows['0'].start,
              end: need.suggestion.dayWindows['0'].end,
            })}
          </button>
        </div>
      )}
      {!need.fits && need.suggestion?.kind === 'extend' && (
        <div className="flex flex-wrap items-center gap-2">
          <span>{t('Même à {h} h/jour, ça ne rentre pas.', { h: MAX_PERIOD_HOURS })}</span>
          <button type="button" className={btnGhost} onClick={() => applySuggestion(need.suggestion!)}>
            <CalendarRange className="w-3.5 h-3.5 text-amber-600" />
            {t('Allonger la période : du {start} au {end}, {h} h/jour', {
              start: formatFrenchDate(need.suggestion.start),
              end: formatFrenchDate(need.suggestion.end),
              h: need.suggestion.hours,
            })}
          </button>
          <span>{t('ou réduisez les passages des cours bien maîtrisés (étape suivante).')}</span>
        </div>
      )}
      {!need.fits && !need.suggestion && <p>{t('Réduisez les passages ou le nombre de cours : même une période bien plus longue ne suffirait pas.')}</p>}
    </div>
  );

  const stepConstraints = (
    <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
      <section className="space-y-2">
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
          {t('Nom')}
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} font-sans block w-full mt-1 text-sm`} maxLength={60} />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {t('Du')}
            <input type="date" value={start} min={todayIso} onChange={(e) => e.target.value && setStart(e.target.value)} className={`${inputCls} block mt-1`} />
          </label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {t('Au')}
            <input type="date" value={end} min={start} onChange={(e) => e.target.value && setEnd(e.target.value)} className={`${inputCls} block mt-1`} />
          </label>
          {datesValid && (
            <span className="text-xs text-slate-500 dark:text-slate-400 pb-2">
              {plural(diffInDays(end, start < todayIso ? todayIso : start) + 1, '{n} jour', '{n} jours')}
              {settings.examDate && ` · ${t('examen le {date}', { date: formatFrenchDate(settings.examDate) })}`}
            </span>
          )}
        </div>
        {!datesValid && <p className="text-xs text-rose-600 dark:text-rose-400">{t('La date de fin doit suivre la date de début, et ne pas être passée.')}</p>}
        {overlaps.length > 0 && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {t('Ces dates chevauchent la période « {name} » ({start} – {end}).', {
              name: overlaps[0].name,
              start: formatFrenchDate(overlaps[0].start),
              end: formatFrenchDate(overlaps[0].end),
            })}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t('Horaires pendant la période')}</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('Ils remplacent vos horaires habituels pendant ces dates seulement ; après la période, tout redevient comme avant.')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="flex items-center gap-2 text-xs">
              <span className="w-10 font-semibold text-slate-700 dark:text-slate-300 capitalize">{weekdayLabel(w)}</span>
              <input
                type="time"
                value={windows[w].start}
                onChange={(e) => e.target.value && setWindows((p) => ({ ...p, [w]: { ...p[w], start: e.target.value } }))}
                className={inputCls}
              />
              <span className="text-slate-400">–</span>
              <input
                type="time"
                value={windows[w].end}
                onChange={(e) => e.target.value && setWindows((p) => ({ ...p, [w]: { ...p[w], end: e.target.value } }))}
                className={inputCls}
              />
              <span className="text-[11px] font-mono text-slate-400">{formatMinutes(netWindowMinutes(windows[w], breaks))}</span>
            </div>
          ))}
        </div>
        <button type="button" className={btnGhost} onClick={() => setWindows(Object.fromEntries(WEEKDAYS.map((w) => [w, windows['0']])))}>
          {t('Horaires du lundi pour tous les jours')}
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t('Pauses')}</h3>
        {breaks.length === 0 && <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('Aucune pause.')}</p>}
        {breaks.map((b, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <input
              type="time"
              value={b.start}
              onChange={(e) => e.target.value && setBreaks((p) => p.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
              className={inputCls}
            />
            <span className="text-slate-400">–</span>
            <input
              type="time"
              value={b.end}
              onChange={(e) => e.target.value && setBreaks((p) => p.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
              className={inputCls}
            />
            <button
              type="button"
              aria-label={t('Retirer cette pause')}
              onClick={() => setBreaks((p) => p.filter((_, j) => j !== i))}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button type="button" className={btnGhost} onClick={() => setBreaks((p) => [...p, { start: '12:00', end: '13:00' }])}>
          <Plus className="w-3.5 h-3.5" />
          {t('Ajouter une pause')}
        </button>
      </section>

      <section className="flex flex-wrap gap-5">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
          {t('Objectif par jour (heures)')}
          <input
            type="number"
            min={1}
            max={14}
            step={0.5}
            value={targetHours}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 0.5 && v <= 14) setTargetHours(v);
            }}
            className={`${inputCls} block mt-1 w-24`}
          />
        </label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
          {t('Durée d\'une révision')}
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${inputCls} block mt-1`}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {formatMinutes(d)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {needBanner}
    </div>
  );

  // ---------------------------------------------------------------------------------------------
  // Étape 3 : aperçu
  // ---------------------------------------------------------------------------------------------

  const subjectOrder = useMemo(() => {
    const ids = [...new Set(chosenCourses.map((c) => c.subjectId))];
    return ids.map((id) => getSubject(id, subjects)).sort((a, b) => a.name.localeCompare(b.name));
  }, [chosenCourses, subjects]);

  const addedIds = useMemo(() => new Set(plan?.added.map((r) => r.id) ?? []), [plan]);
  const periodDays = plan?.days.map((d) => d.date) ?? [];
  const firstWeekDay = periodDays[0] ?? start;
  const shownWeekStart = weekStart && periodDays.includes(weekStart) ? weekStart : firstWeekDay;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(shownWeekStart, i));
  const canPrevWeek = shownWeekStart > firstWeekDay;
  const canNextWeek = addDays(shownWeekStart, 7) <= (periodDays[periodDays.length - 1] ?? end);
  // Un peu de marge au-dessus : la ligne d'objectif reste visible même quand c'est la valeur la plus haute
  const maxDayMinutes = 1.12 * Math.max(60, ...(plan?.days.map((d) => Math.max(d.load.totalMinutes, d.load.targetMinutes)) ?? [0]));
  const removedJ = plan?.conversions.reduce((s, c) => s + c.removed.length, 0) ?? 0;
  const unresolvedCount = plan?.unresolved.reduce((s, u) => s + u.count, 0) ?? 0;

  const stepPreview = plan && (
    <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-xs text-sky-900 dark:text-sky-200">
        <Eye className="w-4 h-4 shrink-0" />
        <span className="font-semibold">{t('Aperçu : rien n\'est encore modifié.')}</span>
        <span className="hidden sm:inline">{t('Changez les passages ou tirez une autre répartition, puis « Planifier ».')}</span>
      </div>

      <details className="text-xs text-slate-600 dark:text-slate-400">
        <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-300">{t('Comment ça marche ?')}</summary>
        <div className="mt-2">
          <PlanningRules kind="period" />
        </div>
      </details>

      {/* Ce que « Planifier » changera */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { v: plan.added.length, l: t('révisions ajoutées') },
          { v: plan.conversions.length, l: t('cours passent en révision libre') },
          { v: removedJ, l: t('J à venir retirés') },
          { v: plan.days.filter((d) => d.load.alert).length, l: t('jours à surveiller (charge ou hors plage)') },
        ].map((x) => (
          <div key={x.l} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <span className="block text-xl font-bold text-slate-900 dark:text-white font-mono">{x.v}</span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400">{x.l}</span>
          </div>
        ))}
      </div>

      {unresolvedCount > 0 && (
        <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {plural(unresolvedCount, '{n} passage ne trouve pas de place', '{n} passages ne trouvent pas de place')}
          </p>
          <p>
            {plan.unresolved
              .map((u) => `${courses.find((c) => c.id === u.courseId)?.title ?? '?'} (${u.count})`)
              .join(' · ')}
          </p>
        </div>
      )}
      {needBanner && !need?.fits && needBanner}

      {/* Vue d'ensemble : une barre par jour, segments par discipline */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t('Charge jour par jour')}</h3>
        <div className="overflow-x-auto pb-1">
          <div className="flex items-end gap-1 h-28" style={{ minWidth: plan.days.length * 22 }}>
            {plan.days.map((d) => {
              const other = d.load.totalMinutes - d.added.reduce((s, a) => s + a.count, 0) * duration;
              const inWeek = weekDays.includes(d.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setWeekStart(d.date)}
                  title={`${formatFrenchDayShort(d.date)} · ${formatMinutes(d.load.totalMinutes)} / ${formatMinutes(d.load.targetMinutes)}`}
                  className={`relative flex-1 min-w-[18px] h-full flex flex-col justify-end rounded-md ${inWeek ? 'bg-teal-50 dark:bg-teal-950/30' : ''}`}
                >
                  <span
                    className="absolute left-0 right-0 z-10 border-t border-dashed border-slate-500/80 dark:border-slate-400/80"
                    style={{ bottom: `${(d.load.targetMinutes / maxDayMinutes) * 100}%` }}
                    aria-hidden="true"
                  />
                  <span className="flex flex-col-reverse w-full rounded-sm overflow-hidden" style={{ height: `${(d.load.totalMinutes / maxDayMinutes) * 100}%` }}>
                    {other > 0 && <span className="bg-slate-300 dark:bg-slate-600" style={{ flexGrow: other }} />}
                    {d.added.map((a) => (
                      <span key={a.subjectId} style={{ flexGrow: a.count * duration, backgroundColor: getSubject(a.subjectId, subjects).color }} />
                    ))}
                  </span>
                  {d.load.alert && <AlertTriangle className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 text-amber-500" />}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1 mt-1" style={{ minWidth: plan.days.length * 22 }}>
            {plan.days.map((d) => (
              <span key={d.date} className="flex-1 min-w-[18px] text-center text-[9px] font-mono text-slate-400">
                {weekdayIndex(d.date) === 0 || d.date === plan.days[0].date ? d.date.slice(8) : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
          {subjectOrder.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />
            {t('Autres créneaux')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 border-t border-dashed border-slate-400" />
            {t('Objectif')}
          </span>
        </div>
      </section>

      {/* Planning simulé, semaine par semaine */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white flex-1">
            {t('Semaine du {date}', { date: formatFrenchDate(shownWeekStart) })}
          </h3>
          <button type="button" aria-label={t('Semaine précédente')} disabled={!canPrevWeek} onClick={() => setWeekStart(addDays(shownWeekStart, -7) < firstWeekDay ? firstWeekDay : addDays(shownWeekStart, -7))} className={btnGhost}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" aria-label={t('Semaine suivante')} disabled={!canNextWeek} onClick={() => setWeekStart(addDays(shownWeekStart, 7))} className={btnGhost}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <MultiDayTimeline
          days={weekDays}
          todayIso={todayIso}
          selectedDate={todayIso}
          revisions={plan.revisions}
          courses={courses.map((c) => plan.conversions.find((x) => x.course.id === c.id)?.course ?? c)}
          subjects={subjects}
          settings={plan.settings}
          hourHeight={hourHeight}
          onChangeHourHeight={(dir) => setHourHeight((h) => stepHourHeight(h, dir))}
          onOpenDay={() => undefined}
          onOpenSlotDetail={() => undefined}
          onOpenCompleteModal={() => undefined}
          onOpenQuickShift={() => undefined}
          onStartStudySession={() => undefined}
          onMoveSlots={() => undefined}
          onMoveToDay={() => undefined}
          readOnly
          highlightIds={addedIds}
        />
      </section>

      {/* Passages par cours, groupés par discipline */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t('Passages par cours')}</h3>
        {subjectOrder.map((s) => {
          const list = chosenCourses.filter((c) => c.subjectId === s.id).sort((a, b) => a.title.localeCompare(b.title));
          const total = plan.added.filter((r) => list.some((c) => c.id === r.courseId)).length;
          const perDay = Math.max(0, ...plan.days.map((d) => d.added.find((a) => a.subjectId === s.id)?.count ?? 0));
          return (
            <div key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/40">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-xs font-bold text-slate-900 dark:text-white flex-1">{s.name}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {plural(total, '{n} révision', '{n} révisions')} · {t('au plus {n} par jour', { n: perDay })}
                </span>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {list.map((c) => {
                  const n = effectivePasses[c.id];
                  const dates = plan.added.filter((r) => r.courseId === c.id).map((r) => r.scheduledDate).sort();
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getCourseEffectiveColor(c, s) }} />
                      <span className="text-sm text-slate-900 dark:text-slate-100 min-w-0 flex-1 break-words">
                        {c.title}
                        {c.mastery > 0 && <span className="ml-1.5 text-[11px] text-amber-500">{'★'.repeat(c.mastery)}</span>}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={t('Un passage de moins')}
                          disabled={n <= 0}
                          onClick={() => setPasses((p) => ({ ...p, [c.id]: clampPasses(n - 1) }))}
                          className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-20 text-center text-xs font-semibold whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {plural(n, '{n} passage', '{n} passages')}
                        </span>
                        <button
                          type="button"
                          aria-label={t('Un passage de plus')}
                          disabled={n >= 6}
                          onClick={() => setPasses((p) => ({ ...p, [c.id]: clampPasses(n + 1) }))}
                          className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </span>
                      <span className="basis-full sm:basis-auto flex flex-wrap gap-1 pl-5 sm:pl-0">
                        {dates.map((d, i) => (
                          <button
                            key={`${d}-${i}`}
                            type="button"
                            onClick={() => setWeekStart(d)}
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                          >
                            {formatFrenchDayShort(d)}
                          </button>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );

  // ---------------------------------------------------------------------------------------------

  const titles: Record<Step, string> = {
    1: t('Choisir les cours'),
    2: t('Dates et horaires'),
    3: t('Aperçu de la répartition'),
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full ${
          step === 3 ? 'max-w-6xl' : 'max-w-2xl'
        } overflow-hidden flex flex-col h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)]`}
        role="dialog"
        aria-modal="true"
        aria-label={t('Période de révision')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <CalendarRange className="w-5 h-5 text-teal-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('Période de révision')}</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('Étape {n} sur 3 · {title}', { n: step, title: titles[step] })}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('Fermer')}
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 1 && stepCourses}
        {step === 2 && stepConstraints}
        {step === 3 && (stepPreview || <div className="flex-1" />)}

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex-1 min-w-0">
            {plural(selected.size, '{n} cours choisi', '{n} cours choisis')}
          </span>
          {step > 1 && (
            <button type="button" className={btnGhost} onClick={() => setStep((s) => (s - 1) as Step)}>
              <ChevronLeft className="w-3.5 h-3.5" />
              {t('Retour')}
            </button>
          )}
          {step === 3 && (
            <button type="button" className={btnGhost} onClick={() => setSeed((s) => s + 1)}>
              <Shuffle className="w-3.5 h-3.5" />
              {t('Autre répartition')}
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              className={btnPrimary}
              disabled={step === 1 ? selected.size === 0 : !canPlan}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              {t('Suivant')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button type="button" className={btnPrimary} disabled={!plan || plan.added.length === 0} onClick={() => plan && onApply(period, plan)}>
              <Check className="w-3.5 h-3.5" />
              {t('Planifier')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
