/**
 * Identité de l'application affichée à l'écran. Ce fichier est adapté à l'export public
 * (scripts/export-public.sh) : le dépôt public s'appelle autrement et n'affiche pas de sous-titre.
 */
export const APP_NAME = 'methodJ';
/** Court sous-titre sous le nom dans la barre du haut ; vide = rien. À afficher avec `t(APP_TAGLINE)`. */
export const APP_TAGLINE: string = ''; // sous-titre de l'édition privée : T('Médecine');
/** Préfixe des fichiers que l'application crée (sauvegarde JSON). */
export const APP_FILE_PREFIX = 'methodj';
