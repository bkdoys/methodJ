import React, { useState } from 'react';
import { AppSettings, MasteryLevel, Subject } from '../types';
import { RichTextEditor } from './RichTextEditor';
import { addDays, formatFrenchDate, formatMinutes, getTodayIso } from '../utils/dateUtils';
import { JIntervalAdder } from './JIntervalAdder';
import { DEFAULT_J_PATTERNS, getJPool, getSlotDurationMinutes } from '../utils/jMethod';
import { BookOpen, Calendar, Plus, X, Check } from 'lucide-react';
import { PRESET_COURSE_COLORS } from '../utils/colorUtils';
import { t } from '../i18n';

interface NewCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
  settings: AppSettings;
  onSaveCourse: (
    courseData: {
      title: string;
      itemCode: string;
      subjectId: string;
      customColor?: string;
      j0Date: string;
      activeJList: number[];
      mastery: MasteryLevel;
      notes: string;
    },
    saveAsDefaultPattern: boolean
  ) => void;
}

export const NewCourseModal: React.FC<NewCourseModalProps> = ({
  isOpen,
  onClose,
  subjects,
  settings,
  onSaveCourse,
}) => {
  const [title, setTitle] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || 'sub_cardio');
  const [customColor, setCustomColor] = useState<string | undefined>(undefined);
  const [j0Date, setJ0Date] = useState(getTodayIso());
  const [activeJList, setActiveJList] = useState<number[]>(settings.defaultJPattern);
  const [notes, setNotes] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  if (!isOpen) return null;

  const toggleJ = (val: number) => {
    if (val === 0) return; // J0 is always required
    if (activeJList.includes(val)) {
      setActiveJList(activeJList.filter((j) => j !== val));
    } else {
      setActiveJList([...activeJList, val].sort((a, b) => a - b));
    }
  };

  const handleApplyPreset = (pattern: number[]) => {
    setActiveJList([...pattern].sort((a, b) => a - b));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSaveCourse(
      {
        title: title.trim(),
        itemCode: itemCode.trim() || 'MED',
        subjectId,
        customColor: customColor || undefined,
        j0Date,
        activeJList: activeJList.includes(0) ? activeJList : [0, ...activeJList],
        mastery: 0,
        notes: notes.trim(),
      },
      saveAsDefault
    );

    // Reset and close
    setTitle('');
    setItemCode('');
    setCustomColor(undefined);
    setShowColorPicker(false);
    setNotes('');
    onClose();
  };

  const selectedSubject = subjects.find((s) => s.id === subjectId) || subjects[0];
  const effectiveColor = customColor || selectedSubject.color;
  const sortedJ = [...activeJList].sort((a, b) => a - b);
  const totalMinutes = sortedJ.reduce((acc, j) => acc + getSlotDurationMinutes(j, settings), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Color Accent */}
        <div className="h-2 w-full" style={{ backgroundColor: effectiveColor }} />

        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('Planifier un nouveau cours / item')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('Définition du J0 et génération automatique des créneaux de révision espacée')}
                </p>
              </div>
            </div>
            <button
              aria-label={t('Fermer')}
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content */}
          <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Title & Item Code */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {t('Intitulé du cours / Chapitre')}{' '}<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('Ex: Item 103 · Épilepsies de l\'enfant et de l\'adulte')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {t('Réf / Code')}
                </label>
                <input
                  type="text"
                  placeholder={t('EDN-103')}
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>
            </div>

            {/* Subject Picker */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                {t('Matière médicale & Code couleur')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {subjects.map((sub) => {
                  const isSelected = subjectId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSubjectId(sub.id)}
                      className={`px-2.5 py-2 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2 ${
                        isSelected
                          ? 'ring-2 ring-teal-500 border-transparent shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                      style={{
                        backgroundColor: isSelected ? sub.accentBg : undefined,
                        borderColor: isSelected ? sub.color : undefined,
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: sub.color }}
                      />
                      <span className="truncate dark:text-white" style={{ color: isSelected ? sub.color : undefined }}>
                        {sub.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* J0 Date Picker */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-0.5">
                    <Calendar className="w-4 h-4 text-teal-600" />
                    <span>{t('Date du premier apprentissage (J0)')}</span>
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('Point de départ du cycle d\'espacement des révisions')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={j0Date}
                    onChange={(e) => e.target.value && setJ0Date(e.target.value)}
                    className="px-3 py-1.5 text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => setJ0Date(getTodayIso())}
                    className="px-2.5 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100"
                  >
                    {t('Aujourd\'hui')}
                  </button>
                </div>
              </div>
            </div>

            {/* Interval selection */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    {t('Choix des répétitions (Méthode des J)')}
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('Durées des créneaux réglables dans Préférences, onglet Répétitions')}
                  </span>
                </div>

                {/* Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500">{t('Préréglages :')}</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(DEFAULT_J_PATTERNS.ednClassique)}
                    className="px-2 py-0.5 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded text-slate-700 dark:text-slate-300"
                  >
                    {t('EDN Classique')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(DEFAULT_J_PATTERNS.passIntensif)}
                    className="px-2 py-0.5 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded text-slate-700 dark:text-slate-300"
                  >
                    {t('PASS Intensif')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(DEFAULT_J_PATTERNS.cycleLong)}
                    className="px-2 py-0.5 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded text-slate-700 dark:text-slate-300"
                  >
                    {t('Cycle Long')}
                  </button>
                </div>
              </div>

              {/* J chips toggle */}
              <div className="flex flex-wrap gap-1.5 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl mb-2">
                {[...new Set([...getJPool(settings), ...activeJList])].sort((a, b) => a - b).map((jVal) => {
                  const isChecked = activeJList.includes(jVal);
                  return (
                    <button
                      key={jVal}
                      type="button"
                      disabled={jVal === 0}
                      onClick={() => toggleJ(jVal)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 ${
                        isChecked
                          ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                      }`}
                    >
                      <span>J{jVal}</span>
                      <span className="text-[10px] opacity-80 font-normal">
                        ({formatMinutes(getSlotDurationMinutes(jVal, settings))})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Ajout d'un intervalle pour ce cours */}
              <JIntervalAdder
                label={t('Autre intervalle :')}
                existing={activeJList}
                onAdd={(num) => setActiveJList((prev) => [...new Set([...prev, num])].sort((x, y) => x - y))}
              />
            </div>

            {/* Schedule Live Preview */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {t('Planning calculé ({n} créneaux · {d} au total)', { n: sortedJ.length, d: formatMinutes(totalMinutes) })}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  {t('Cycle jusqu\'au {date}', { date: formatFrenchDate(addDays(j0Date, sortedJ[sortedJ.length - 1] || 0)) })}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sortedJ.map((jVal) => {
                  const date = addDays(j0Date, jVal);
                  const duration = getSlotDurationMinutes(jVal, settings);
                  return (
                    <div
                      key={jVal}
                      className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] flex items-center gap-1.5 shadow-2xs"
                    >
                      <span className="font-bold text-teal-700 dark:text-teal-400">J{jVal}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-300 font-mono">{date.slice(5)}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1 rounded font-medium">
                        {formatMinutes(duration)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Couleur du cours dans le calendrier (version discrète) */}
            <div className="pt-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full ring-1 ring-black/10 shrink-0"
                    style={{ backgroundColor: effectiveColor }}
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {t('Couleur dans le calendrier')}
                    <span className="text-slate-400 dark:text-slate-500">
                      {' '}· {customColor ? t('personnalisée') : t('matière ({code})', { code: selectedSubject.code })}
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {customColor && (
                    <button
                      type="button"
                      onClick={() => setCustomColor(undefined)}
                      className="text-[11px] text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 hover:underline"
                    >
                      {t('Réinitialiser')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowColorPicker((v) => !v)}
                    className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    {showColorPicker ? t('Masquer') : t('Modifier')}
                  </button>
                </div>
              </div>

              {showColorPicker && (
                <div className="flex items-center gap-1.5 flex-wrap pt-3">
                  {PRESET_COURSE_COLORS.map((preset) => {
                    const isSelected = effectiveColor.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setCustomColor(preset.hex)}
                        title={preset.name}
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform ${
                          isSelected
                            ? 'ring-2 ring-offset-1 ring-slate-700 dark:ring-white dark:ring-offset-slate-900 scale-110'
                            : 'hover:scale-110 opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white drop-shadow-xs" />}
                      </button>
                    );
                  })}

                  <label
                    title={t('Couleur personnalisée')}
                    className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 hover:border-teal-500 cursor-pointer flex items-center justify-center bg-white dark:bg-slate-900"
                  >
                    <input
                      type="color"
                      value={effectiveColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      className="sr-only"
                    />
                    <Plus className="w-3 h-3 text-slate-500" />
                  </label>
                </div>
              )}
            </div>

            {/* Remember as default setting option */}
            <div className="flex items-center gap-2 pt-1">
              <input
                id="default-pattern-check"
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
              />
              <label htmlFor="default-pattern-check" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                {t('Mémoriser cette sélection de J comme réglage par défaut pour éviter de répéter à chaque cours')}
              </label>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {t('Objectifs clés / Mots-clés EDN (optionnel)')}
              </label>
              <RichTextEditor
                value={notes}
                onChange={setNotes}
                placeholder={t('Ex: Critères diagnostiques, scores de gravité, contre-indications absolues...')}
                minRows={3}
                maxHeight="40vh"
                className="w-full px-3 py-2 text-sm leading-relaxed border border-slate-200 dark:border-slate-700 rounded-xl dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            >
              {t('Annuler')}
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t('Créer et planifier')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
