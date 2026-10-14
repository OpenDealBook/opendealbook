import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES, storageKeyName, uploadRefusal } from './allowed';

describe('uploadRefusal', () => {
  it('accepts a file of exactly 300 MiB', () => {
    expect(
      uploadRefusal({ name: 'model.xlsx', size: 300 * 1024 * 1024 }),
    ).toBeNull();
  });

  it('refuses a file one byte over 300 MiB, naming the file and the limit', () => {
    expect(
      uploadRefusal({ name: 'survey.dwg', size: MAX_UPLOAD_BYTES + 1 }),
    ).toBe('survey.dwg is larger than the 300 MiB limit');
  });

  it.each([
    'tour.mp4',
    'tour.MOV',
    'tour.m4v',
    'tour.avi',
    'tour.mkv',
    'tour.webm',
    'tour.wmv',
    'tour.flv',
    'tour.mpg',
    'tour.mpeg',
    'tour.3gp',
    'call.mp3',
    'call.WAV',
    'call.m4a',
    'call.aac',
    'call.flac',
    'call.ogg',
    'call.oga',
    'call.wma',
    'call.aiff',
    'call.opus',
  ])('refuses %s as video or audio, naming the file', (name) => {
    expect(uploadRefusal({ name, size: 10 })).toBe(
      `${name} cannot be uploaded: video and audio files are not allowed`,
    );
  });

  it('accepts a document whose name only contains a media extension', () => {
    expect(uploadRefusal({ name: 'mp4.notes.pdf', size: 10 })).toBeNull();
  });

  it.each([
    ['an empty name', ''],
    ['a name with a slash', 'a/../../other/x.pdf'],
    ['a name with a backslash', 'dir\\x.pdf'],
    ['a name with a control character', 'x\u0000.pdf'],
    ['a name that is only an extension', '.zip'],
    ['a name longer than 255 characters', `${'a'.repeat(252)}.pdf`],
  ])('refuses %s, naming the file', (_, name) => {
    expect(uploadRefusal({ name, size: 10 })).toBe(
      `"${name}" cannot be used as a file name`,
    );
  });

  it('ignores whitespace around the name when judging it', () => {
    expect(uploadRefusal({ name: ' clip.mp4 ', size: 10 })).toBe(
      'clip.mp4 cannot be uploaded: video and audio files are not allowed',
    );
  });

  it('accepts a name of exactly 255 characters', () => {
    expect(
      uploadRefusal({ name: `${'a'.repeat(251)}.pdf`, size: 10 }),
    ).toBeNull();
  });
});

describe('storageKeyName', () => {
  it('keeps ASCII letters, digits, dot, dash, and underscore', () => {
    expect(storageKeyName('Q3_report-v2.final.PDF')).toBe(
      'Q3_report-v2.final.PDF',
    );
  });

  it('turns every other character into an underscore', () => {
    expect(storageKeyName('r\u00e9sum\u00e9 (final)#1%.pdf')).toBe(
      'r_sum___final__1_.pdf',
    );
  });
});
