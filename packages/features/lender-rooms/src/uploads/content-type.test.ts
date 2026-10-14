import { describe, expect, it } from 'vitest';

import { contentTypeFor } from './content-type';

describe('contentTypeFor', () => {
  it.each([
    ['report.pdf', 'application/pdf'],
    ['Scan.PNG', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['anim.gif', 'image/gif'],
    ['shot.webp', 'image/webp'],
    ['IMG_1.HEIC', 'image/heic'],
    ['IMG_2.heif', 'image/heif'],
    [
      'letter.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['letter.doc', 'application/msword'],
    [
      'model.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    ['model.xls', 'application/vnd.ms-excel'],
    [
      'deck.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    ['deck.ppt', 'application/vnd.ms-powerpoint'],
    ['mail.msg', 'application/vnd.ms-outlook'],
    ['mail.eml', 'message/rfc822'],
    ['notes.txt', 'text/plain'],
    ['rows.csv', 'text/csv'],
  ])('gives %s the type %s', (name, type) => {
    expect(contentTypeFor(name)).toBe(type);
  });

  it('gives an extension it does not know a generic binary type', () => {
    expect(contentTypeFor('drawing.dwg')).toBe('application/octet-stream');
  });

  it('gives a name with no extension a generic binary type', () => {
    expect(contentTypeFor('README')).toBe('application/octet-stream');
  });
});
