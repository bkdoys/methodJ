import { describe, expect, it } from 'vitest';
import { buildMultipartBody, describeDriveError, driveQueryString, fileInFolderQuery, GoogleDriveError } from '../googleDrive';

describe('google drive helpers', () => {
  it('escapes quotes and backslashes in query literals', () => {
    expect(driveQueryString('medj.json')).toBe("'medj.json'");
    expect(driveQueryString("l'an")).toBe("'l\\'an'");
    expect(driveQueryString('a\\b')).toBe("'a\\\\b'");
  });

  it('looks for a non-trashed file of that name in the folder', () => {
    expect(fileInFolderQuery('F1', 'b.json')).toBe("name = 'b.json' and 'F1' in parents and trashed = false");
  });

  it('builds a multipart body with the metadata then the content', () => {
    const body = buildMultipartBody({ name: 'b.json', parents: ['F1'] }, '{"x":1}', 'application/json', 'XYZ');
    expect(body).toBe(
      '--XYZ\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name":"b.json","parents":["F1"]}\r\n' +
        '--XYZ\r\nContent-Type: application/json\r\n\r\n{"x":1}\r\n--XYZ--',
    );
  });

  it('describes common Drive errors', () => {
    expect(describeDriveError(new GoogleDriveError(401, 'x'))).toMatch(/expirée/);
    expect(describeDriveError(new GoogleDriveError(403, 'Drive API has not been used in project'))).toMatch(/pas activée/);
    expect(describeDriveError(new Error('Autorisation annulée.'))).toBe('Autorisation annulée.');
  });
});
