import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

// SQLite (WebAssembly) pour lire la base d'un paquet Anki. Chargé à l'ouverture de l'import seulement, une fois par
// session ; le fichier .wasm est servi par l'application elle-même (la politique de sécurité autorise `wasm-unsafe-eval`).
let loading: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  loading ??= initSqlJs({ locateFile: () => wasmUrl });
  return loading;
}
