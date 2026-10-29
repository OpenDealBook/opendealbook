import { describe, expect, it } from 'vitest';

import { parseCsl } from './csl';
import {
  SCREENING_THRESHOLD,
  type ScreenedEntry,
  type ScreeningSubject,
  matchSubjects,
  screeningScore,
} from './match';

import { readFileSync } from 'node:fs';

const { entries } = parseCsl(
  readFileSync(new URL('./fixtures/consolidated.json', import.meta.url), 'utf8'),
);

const listed = (name: string, entry_type: string | null) => ({
  list_name: 'SDN',
  source_entry_id: 'sdn-1',
  name,
  alt_names: [],
  entry_type,
  countries: [],
  programs: [],
  source_url: 'https://csl.test/sdn',
  raw: {} as ScreenedEntry['raw'],
});
const business = (name: string) => ({ key: 'seller', name, kind: 'business' as const });
const person = (name: string) => ({ key: 'owner', name, kind: 'person' as const });
const scores = (subject: ScreeningSubject, entry: ScreenedEntry) =>
  matchSubjects([subject], [entry]).map((candidate) => candidate.score);

describe('screeningScore', () => {
  it('ignores word order, case, punctuation and legal suffixes', () => {
    expect(screeningScore('Vladimir Putin', 'PUTIN, Vladimir')).toBe(1);
    expect(screeningScore('Huawei Technologies', 'Huawei Technologies Co., Ltd.')).toBe(1);
  });

  it('folds accents instead of dropping them', () => {
    expect(screeningScore('José Núñez', 'NUNEZ, Jose')).toBe(1);
  });

  it('never matches a name that normalizes to nothing', () => {
    expect(screeningScore('Inc.', '')).toBe(0);
    expect(screeningScore('', 'LLC')).toBe(0);
  });

  it('scores different one-letter names as unrelated', () => {
    expect(screeningScore('X Inc', 'D COMPANY')).toBe(0);
  });

  it('scores a near spelling below an exact name', () => {
    expect(screeningScore('Sberbank', 'SBER BANK')).toBeCloseTo(0.8);
  });
});

describe('matchSubjects', () => {
  it('reports the list entry and the name that matched a subject', () => {
    expect(
      matchSubjects([{ key: 'owner-1', name: 'Vladimir Putin', kind: 'person' }], entries),
    ).toEqual([
      {
        subjectKey: 'owner-1',
        source: 'sanctions',
        listName: 'Specially Designated Nationals (SDN) - Treasury Department',
        sourceEntryId: entries[3]!.source_entry_id,
        entryName: 'PUTIN, Vladimir Vladimirovich',
        matchedName: 'PUTIN, Vladimir',
        score: 1,
        programs: ['RUSSIA-EO14024'],
        url: 'https://sanctionslist.ofac.treas.gov/Home/SdnList',
        entryType: 'individual',
        countries: ['RU'],
        altNames: ['PUTIN, Vladimir'],
        raw: entries[3]!.raw,
      },
    ]);
  });

  it('does not screen subjects against vessels or aircraft', () => {
    expect(matchSubjects([{ key: 'seller', name: 'Mar Azul', kind: 'business' }], entries)).toEqual(
      [],
    );
  });

  it('screens untyped list entries', () => {
    expect(
      matchSubjects([{ key: 'seller', name: 'Huawei Technologies', kind: 'business' }], entries).map(
        (candidate) => [candidate.listName, candidate.entryType],
      ),
    ).toEqual([['Entity List (EL) - Bureau of Industry and Security', null]]);
  });

  it('reports a cross-listed entity once per list', () => {
    expect(
      matchSubjects([{ key: 'seller', name: 'Rosselkhozbank', kind: 'business' }], entries).map(
        (candidate) => candidate.listName,
      ),
    ).toEqual([
      'Non-SDN Menu-Based Sanctions List (NS-MBS List) - Treasury Department',
      'Sectoral Sanctions Identifications List (SSI) - Treasury Department',
    ]);
  });

  it('reports a name that is close but not exact at its own score', () => {
    const [candidate, ...rest] = matchSubjects(
      [{ key: 'seller', name: 'Huawei Technology', kind: 'business' }],
      entries,
    );

    expect(rest).toEqual([]);
    expect(candidate!.entryName).toBe('Huawei Technologies Co., Ltd.');
    expect(candidate!.score).toBeGreaterThanOrEqual(SCREENING_THRESHOLD);
    expect(candidate!.score).toBeLessThan(1);
  });

  describe('foreign legal forms', () => {
    it('ignores them before or after a business name screened against an entity', () => {
      expect(scores(business('Sberbank'), listed('JSC SBERBANK', 'entity'))).toEqual([1]);
      expect(scores(business('Gazprom Neft'), listed('Gazprom Neft OAO', 'entity'))).toEqual([1]);
      expect(
        scores(
          business('Russian Agricultural Bank'),
          listed('Joint Stock Company Russian Agricultural Bank', 'entity'),
        ),
      ).toEqual([1]);
    });

    it('ignores them for a business screened against an untyped entry', () => {
      expect(scores(business('Harrow Werke'), listed('Harrow Werke GmbH', null))).toEqual([1]);
    });

    it('keeps them in the name of a person subject', () => {
      expect(scores(person('Ag Petrov'), listed('PETROV', null))).toEqual([]);
    });

  });

  it('screens a person only against individuals and untyped entries', () => {
    expect(scores(person('Petrov'), listed('PETROV', 'entity'))).toEqual([]);
    expect(scores(person('Petrov'), listed('PETROV', 'individual'))).toEqual([1]);
    expect(scores(person('Petrov'), listed('PETROV', null))).toEqual([1]);
  });

  it('screens a business only against entities and untyped entries', () => {
    expect(scores(business('Petrov'), listed('PETROV', 'individual'))).toEqual([]);
    expect(scores(business('Petrov'), listed('PETROV', 'entity'))).toEqual([1]);
    expect(scores(business('Petrov'), listed('PETROV', null))).toEqual([1]);
  });

  it('reports nothing under the threshold', () => {
    expect(
      matchSubjects([{ key: 'seller', name: 'Bank of Russia', kind: 'business' }], entries),
    ).toEqual([]);
  });
});
