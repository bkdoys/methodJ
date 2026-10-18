import { describe, expect, it } from 'vitest';
import { examSettingsFromValues, examValuesFromSettings } from '../examSettings';

describe('exam settings', () => {
  it('keeps a valid date and drops an empty or malformed one', () => {
    const v = { examDate: '2027-05-20', periodPrompt: 'auto' as const, periodPromptWeeks: 8 };
    expect(examSettingsFromValues(v).examDate).toBe('2027-05-20');
    expect(examSettingsFromValues({ ...v, examDate: '' }).examDate).toBeUndefined();
    expect(examSettingsFromValues({ ...v, examDate: '20/05/2027' }).examDate).toBeUndefined();
  });

  it('does not store the default prompt settings', () => {
    const out = examSettingsFromValues({ examDate: '', periodPrompt: 'auto', periodPromptWeeks: 8 });
    expect(out.periodPrompt).toBeUndefined();
    expect(out.periodPromptWeeks).toBeUndefined();
  });

  it('stores a chosen mode and lead time, bounded', () => {
    expect(examSettingsFromValues({ examDate: '', periodPrompt: 'never', periodPromptWeeks: 12 })).toMatchObject({
      periodPrompt: 'never',
      periodPromptWeeks: 12,
    });
    expect(examSettingsFromValues({ examDate: '', periodPrompt: 'auto', periodPromptWeeks: 0 }).periodPromptWeeks).toBe(1);
    expect(examSettingsFromValues({ examDate: '', periodPrompt: 'auto', periodPromptWeeks: 400 }).periodPromptWeeks).toBe(26);
  });

  it('reads the saved settings back, defaults included', () => {
    expect(examValuesFromSettings({})).toEqual({ examDate: '', periodPrompt: 'auto', periodPromptWeeks: 8 });
    expect(examValuesFromSettings({ examDate: '2027-05-20', periodPrompt: 'always', periodPromptWeeks: 3 })).toEqual({
      examDate: '2027-05-20',
      periodPrompt: 'always',
      periodPromptWeeks: 3,
    });
  });
});
