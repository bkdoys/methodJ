export type MasteryLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Sous-dossier de rangement d'une discipline (2 niveaux max : `parentId` absent = niveau 1). Sa couleur est celle qu'on lui
 * donne (`color`), sinon une nuance automatique de la couleur de la discipline (voir `utils/folderColors.ts`).
 */
export interface SubjectFolder {
  id: string;
  name: string;
  parentId?: string;
  /** `#rrggbb` choisi pour ce dossier ; absent = nuance automatique. */
  color?: string;
}

/** Lien externe d'un cours (Drive, flashcards…). Le type pointe vers `AppSettings.linkTypes` ; un type supprimé s'affiche comme « Autre ». */
export interface CourseLink {
  id: string;
  url: string;           // http(s) uniquement
  label?: string;        // absent = nom du site
  typeId: string;
}

/** Type de lien défini par l'utilisateur (liste commune à tous les cours). */
export interface LinkType {
  id: string;
  name: string;
  icon: string;          // clé de LINK_ICONS (utils/courseLinks)
  color: string;         // hex
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  color: string;       // Primary hex color
  bgColor: string;     // Tailwind bg class for badge
  textColor: string;   // Tailwind text class
  borderColor: string; // Tailwind border class
  accentBg: string;    // Light tint
  folders?: SubjectFolder[]; // Arborescence de rangement des cours dans la discipline
}

export interface RevisionItem {
  id: string;
  courseId: string;
  jIndex: number;          // 0, 1, 3, 7, 15, 30, 60, etc. ; pour une révision R, son numéro (1, 2, 3…)
  /** `R` = révision libre ajoutée à la main (cours sans J) : jamais en cascade, `jIndex` est son numéro. Absent = un J. */
  kind?: 'R';
  scheduledDate: string;   // YYYY-MM-DD
  durationMinutes: number; // 90 min for J0 and J1, 60 min for J >= 2
  completed: boolean;
  completedDate?: string;
  rating?: MasteryLevel;
  notes?: string;
  slotOrder: number;       // Order in the day stack
  startTime?: string;      // HH:MM chosen on the day timeline; absent = stacked from the day start
  /** Date prévue figée quand le J0 du cours est validé (jamais pour le J0) : `scheduledDate` bouge, elle non. Sert à mesurer la dérive. */
  originalDate?: string;
}

export interface Course {
  id: string;
  title: string;
  itemCode: string;        // e.g. "EDN-228"
  subjectId: string;
  folderId?: string;       // Sous-dossier de la discipline où le cours est rangé ; absent = à la racine de la discipline
  links?: CourseLink[];    // Liens externes (cours, notes, flashcards…) affichés dans les fiches du cours et des J
  customColor?: string;    // Custom color override for this course (defaults to subject.color)
  j0Date: string;          // YYYY-MM-DD (cours libre : date de création, sans J0)
  activeJList: number[];   // e.g. [0, 1, 3, 7, 15, 30, 60] ; vide pour un cours libre
  /** `free` = cours sans J programmé : on lui ajoute des révisions R à la main. Absent = méthode des J. */
  mode?: 'free';
  /** Cours caché « Cartes à trier » : reçoit les cartes créées sans cours (voir utils/inbox.ts). */
  inbox?: true;
  mastery: MasteryLevel;
  notes?: string;
  createdAt: string;
}

/**
 * Période de révision : des cours repassés en révision libre et des R réparties entre `start` et `end` (inclus).
 * Pendant ces dates, ses plages, pauses et objectif remplacent les réglages habituels ; absents = réglages habituels.
 * Deux périodes ne se chevauchent jamais.
 */
export interface RevisionPeriod {
  id: string;
  name: string;
  start: string;
  end: string;
  courseIds: string[];
  /** Plages par jour de semaine ("0" = lundi … "6"), même forme que `AppSettings.dayWindows`. */
  dayWindows?: Record<string, { start: string; end: string }>;
  /** Pauses de chaque jour de la période ; `[]` = aucune. */
  breaks?: { start: string; end: string }[];
  /** Objectif d'heures par jour pendant la période. */
  targetHours?: number;
  createdAt: string;
}

export interface AppSettings {
  defaultJPattern: number[];
  /** Intervalles J proposés à la création d'un cours (modifiable) ; absent = liste d'origine. J0 y est toujours. */
  jPool?: number[];
  autoCascadeShift: boolean;
  dailyTargetHours: number;
  /** Date de l'examen (AAAA-MM-JJ, facultative) : sans elle, la vue Statistiques n'affiche aucune projection. */
  examDate?: string;
  /**
   * Quand proposer la période de révision (carte du Tableau de bord, bouton de la vue Cours) : `auto` (défaut) = à
   * `periodPromptWeeks` semaines ou moins de la date d'examen, `always` = toujours, `never` = jamais.
   */
  periodPrompt?: 'auto' | 'always' | 'never';
  /** Semaines avant l'examen à partir desquelles `auto` propose la période ; absent = 8 (1 à 26). */
  periodPromptWeeks?: number;
  slotDurationJ0J1: number;    // default 90 minutes
  slotDurationOthers: number;  // default 60 minutes
  /** Durée par défaut d'un créneau (minutes) ; absent = `slotDurationOthers`. */
  slotDurationDefault?: number;
  /** Durée propre à certains J (clé = J, valeur = minutes) ; elle l'emporte sur la durée par défaut. */
  slotDurationByJ?: Record<string, number>;
  dayStartTime: string;        // e.g. "08:00"
  timelineStartHour: number;   // first hour shown on the day timeline (0-23)
  timelineEndHour: number;     // last hour shown on the day timeline (1-24)
  timelineStepMinutes: number; // drag snapping step: 5, 10, 15, 30 or 60
  /** Allowed hours per weekday ("0" = Monday … "6" = Sunday); a missing day uses the default window. */
  dayWindows?: Record<string, { start: string; end: string }>;
  /**
   * Non-work breaks (e.g. lunch). Key "all" = every day; a weekday key ("0" = Monday … "6") replaces "all" for that
   * day (an empty list = no break that day). Absent = no break.
   */
  breaks?: Record<string, { start: string; end: string }[]>;
  /** Days (YYYY-MM-DD) where the user chose to ignore breaks and the allowed-hours window (manual placement allowed anywhere on the scale). */
  forcedDates?: string[];
  /** Number of days of the multi-day view (2-6). */
  multiDayCount?: number;
  /** What the full-size timeline blocks show; a missing flag uses its default. */
  blockDetails?: { subject?: boolean | 'none' | 'code' | 'name'; code?: boolean; notes?: boolean; rating?: boolean };
  /** Types de liens des cours ; absent = liste d'origine (voir DEFAULT_LINK_TYPES). */
  linkTypes?: LinkType[];
  /** Agenda Google créé par l'application pour les créneaux (envoi direct) ; absent = pas encore créé. */
  googleCalendarId?: string;
  /** Date (ISO) du dernier envoi réussi vers cet agenda ; affichée dans le tableau de bord. */
  googleCalendarSyncedAt?: string;
  /** Dossier Google Drive créé par l'application pour les sauvegardes JSON ; absent = pas encore créé. */
  googleDriveFolderId?: string;
  /** Date (ISO) de la dernière sauvegarde réussie sur Google Drive. */
  googleDriveSavedAt?: string;
  /** Cours en révision libre : alerte quand aucune R n'est planifiée et rien n'a été fait depuis ce nombre de jours ; absent = 15, 0 = jamais. */
  freeAlertDays?: number;
  /**
   * Reports de cette alerte, par cours : `since` = dernière activité au moment du report (une révision faite depuis
   * l'annule), `until` = jour où l'alerte revient, `delay` = jours du dernier report (le suivant en prend la moitié).
   */
  freeAlertSnooze?: Record<string, { since: string; until: string; delay: number }>;
  /** Périodes de révision (avant un examen) : leurs contraintes remplacent les réglages habituels pendant leurs dates. */
  revisionPeriods?: RevisionPeriod[];
  /** Nouvelles cartes (flashcards) proposées par jour dans « Cartes du jour » ; absent = 20. */
  cardsNewPerDay?: number;
  /** Langue de l'interface ; absent = français. */
  language?: 'fr' | 'en';
  splitView: boolean;
  theme: 'light' | 'dark';
}

/**
 * Recto/verso, texte à trous (`{{c1::réponse}}`, `{{c2::réponse::indice}}` : une sous-carte par numéro) ou masques
 * sur une image (une sous-carte par groupe de masques).
 */
export type FlashcardKind = 'basic' | 'cloze' | 'occlusion';

/** Masque d'une carte `occlusion` : rectangle en coordonnées relatives à l'image (0 à 1), `group` ≥ 1. */
/** Forme d'un masque : absente = rectangle. `x, y, w, h` est toujours la boîte englobante. */
export type OcclusionShape = 'rect' | 'ellipse' | 'polygon';

export interface OcclusionMask {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  group: number;
  shape?: OcclusionShape;
  /** Sommets d'un polygone, relatifs à l'image (0 à 1) ; la boîte englobante en est déduite. */
  points?: { x: number; y: number }[];
}

/** `hide-all` : tous les masques couvrent l'image, on en devine un ; `hide-one` : seul le masque deviné couvre. */
export type OcclusionMode = 'hide-all' | 'hide-one';

export interface Flashcard {
  id: string;
  kind: FlashcardKind;
  front: string;           // recto, ou texte à trous
  back?: string;           // verso (recto/verso) ou remarque affichée avec la réponse (texte à trous, masques)
  /** Images (id de média = empreinte SHA-256 du fichier, voir utils/media) ; `occlusion` : l'image masquée. */
  frontImage?: string;
  backImage?: string;
  masks?: OcclusionMask[];
  occlusionMode?: OcclusionMode;
  createdAt: string;       // ISO
  updatedAt: string;       // ISO : la version la plus récente gagne à la fusion entre appareils
  /** Pierre tombale : la suppression se propage aux autres appareils, puis la carte est purgée (voir utils/flashcards). */
  deleted?: true;
}

/** État de programmation (FSRS) d'une sous-carte ; clé = `cardId` (recto/verso) ou `cardId:c2` (texte à trous). */
export interface CardReview {
  due: string;             // ISO
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;    // nouvelle, apprentissage, révision, réapprentissage
  scheduledDays: number;
  step: number;            // étape d'apprentissage en cours (1 min, 10 min…)
  lastReview?: string;     // ISO : l'état le plus récemment noté gagne à la fusion
  firstReview?: string;    // YYYY-MM-DD de la première note : limite des nouvelles cartes par jour
}

/** Paquet de cartes d'un cours : un seul document local et cloud par cours (`id` = id du cours). */
export interface Deck {
  id: string;
  cards: Flashcard[];
  review: Record<string, CardReview>;
}

export type ViewMode = 'agenda' | 'week' | 'month' | 'courses' | 'session' | 'stats' | 'dashboard' | 'cards';

export interface ToastMessage {
  title: string;
  description: string;
  type: 'success' | 'info' | 'error';
  /** Bouton facultatif (ex. « Annuler »). Le message reste plus longtemps affiché. */
  action?: { label: string; onClick: () => void };
}
