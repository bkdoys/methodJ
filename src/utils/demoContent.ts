import { Course, Subject } from '@/src/types';
import { addDays } from '@/src/utils/dateUtils';

/**
 * Contenu de départ de l'édition publique : disciplines génériques et cours d'exemple neutres.
 * Ce fichier remplace src/utils/demoContent.ts à l'export (scripts/export-public.sh) ; il doit garder les mêmes exports.
 * Les chemins en « @/ » fonctionnent aussi bien ici que dans src/utils/ une fois exporté.
 */
export const DEFAULT_SUBJECTS: Subject[] = [
  {
    id: 'sub_sciences',
    name: 'Sciences',
    code: 'SCIENCES',
    color: '#e11d48',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-700',
    borderColor: 'border-rose-200',
    accentBg: '#fff1f2',
  },
  {
    id: 'sub_maths',
    name: 'Mathématiques',
    code: 'MATHS',
    color: '#7c3aed',
    bgColor: 'bg-violet-50',
    textColor: 'text-violet-700',
    borderColor: 'border-violet-200',
    accentBg: '#f5f3ff',
  },
  {
    id: 'sub_langues',
    name: 'Langues',
    code: 'LANGUES',
    color: '#0284c7',
    bgColor: 'bg-sky-50',
    textColor: 'text-sky-700',
    borderColor: 'border-sky-200',
    accentBg: '#f0f9ff',
  },
  {
    id: 'sub_histoire',
    name: 'Histoire & Géographie',
    code: 'HISTOIRE',
    color: '#059669',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    accentBg: '#ecfdf5',
  },
  {
    id: 'sub_droit',
    name: 'Droit',
    code: 'DROIT',
    color: '#d97706',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    accentBg: '#fffbeb',
  },
  {
    id: 'sub_info',
    name: 'Informatique',
    code: 'INFO',
    color: '#dc2626',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    accentBg: '#fef2f2',
  },
  {
    id: 'sub_eco',
    name: 'Économie',
    code: 'ECO',
    color: '#4f46e5',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-700',
    borderColor: 'border-indigo-200',
    accentBg: '#eef2ff',
  },
  {
    id: 'sub_lettres',
    name: 'Lettres & Philosophie',
    code: 'LETTRES',
    color: '#c026d3',
    bgColor: 'bg-fuchsia-50',
    textColor: 'text-fuchsia-700',
    borderColor: 'border-fuchsia-200',
    accentBg: '#fdf4ff',
  },
];

/** Cours d'exemple, étalés autour d'aujourd'hui pour que le planning ne soit pas vide. */
export function getDemoCourses(today: string, jPattern: number[]): Course[] {
  return [
    {
      id: 'c_1',
      title: 'Exemple · Chapitre 1 : les bases',
      itemCode: 'EX-1',
      subjectId: 'sub_sciences',
      j0Date: addDays(today, -3), // J0 il y a 3 jours : aujourd'hui, c'est J3
      activeJList: jPattern,
      mastery: 2 as const,
      notes: 'Exemple de note : définitions à retenir, formules clés, pièges classiques.',
      createdAt: addDays(today, -3),
    },
    {
      id: 'c_2',
      title: 'Exemple · Chapitre 2 : méthode et applications',
      itemCode: 'EX-2',
      subjectId: 'sub_maths',
      j0Date: addDays(today, -1), // J0 hier : aujourd'hui, c'est J1
      activeJList: jPattern,
      mastery: 1 as const,
      notes: 'Exemple de note : refaire les exercices types avant la prochaine révision.',
      createdAt: addDays(today, -1),
    },
    {
      id: 'c_3',
      title: 'Exemple · Chapitre 3 : vocabulaire',
      itemCode: 'EX-3',
      subjectId: 'sub_langues',
      j0Date: today, // J0 aujourd'hui
      activeJList: jPattern,
      mastery: 0 as const,
      notes: 'Exemple de note : fiches de vocabulaire à relire à voix haute.',
      createdAt: today,
    },
    {
      id: 'c_4',
      title: 'Exemple · Chapitre 4 : dates et repères',
      itemCode: 'EX-4',
      subjectId: 'sub_histoire',
      j0Date: addDays(today, -7), // J0 il y a 7 jours : aujourd'hui, c'est J7
      activeJList: jPattern,
      mastery: 3 as const,
      notes: 'Exemple de note : frise chronologique à refaire de mémoire.',
      createdAt: addDays(today, -7),
    },
  ];
}
