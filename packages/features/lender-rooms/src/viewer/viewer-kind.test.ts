import { describe, expect, it } from 'vitest';

import { viewerKind } from './viewer-kind';

describe('viewerKind', () => {
  it.each([
    ['Term sheet.pdf', 'pdf'],
    ['site.png', 'image'],
    ['site.jpg', 'image'],
    ['site.jpeg', 'image'],
    ['site.gif', 'image'],
    ['site.webp', 'image'],
    ['logo.svg', 'image'],
    ['IMG_0042.heic', 'image'],
    ['IMG_0042.heif', 'image'],
    ['Commitment letter.docx', 'word'],
    ['Rent roll.xlsx', 'sheet'],
    ['Rent roll.xls', 'sheet'],
    ['Rent roll.csv', 'sheet'],
    ['Re: updated rent roll.msg', 'msg'],
    ['Re: updated rent roll.eml', 'eml'],
    ['Investor deck.pptx', 'pdf'],
    ['notes.txt', 'text'],
    ['notes.md', 'text'],
    ['export.json', 'text'],
    ['server.log', 'text'],
    ['feed.xml', 'text'],
    ['config.yaml', 'text'],
    ['config.yml', 'text'],
    ['Commitment letter.doc', 'none'],
    ['Investor deck.ppt', 'none'],
    ['walkthrough.mp4', 'none'],
    ['call.mp3', 'none'],
    ['archive.zip', 'none'],
    ['README', 'none'],
  ] as const)('maps %s to %s', (fileName, kind) => {
    expect(viewerKind(fileName)).toBe(kind);
  });

  it('ignores the case of the extension', () => {
    expect(viewerKind('SCAN.PDF')).toBe('pdf');
  });

  it('does not treat a bare name as an extension', () => {
    expect(viewerKind('pdf')).toBe('none');
  });

  it('reads only the last extension', () => {
    expect(viewerKind('statement.pdf.exe')).toBe('none');
  });
});
