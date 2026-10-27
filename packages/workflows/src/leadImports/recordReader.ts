export class RejectedRow extends Error {}

export type CsvRecord = Record<string, string>;

export class RecordReader {
  readonly nulled: string[] = [];

  constructor(readonly record: CsvRecord) {}

  text(field: string): string | null {
    const value = (this.record[field] ?? '').trim();
    return value === '' ? null : value;
  }

  required(field: string): string {
    return this.text(field) ?? this.reject(field, '');
  }

  int(field: string): number | null {
    return this.parsed(field, (value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) ? parsed : null;
    });
  }

  money(field: string): number | null {
    return this.parsed(field, (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    });
  }

  isoDate(field: string): string | null {
    return this.parsed(field, (value) => {
      const match = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T].*)?$/.exec(value);
      return match && `${match[1]}-${match[2]}-${match[3]}`;
    });
  }

  usDate(field: string): string | null {
    return this.parsed(field, (value) => {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})(?: .*)?$/.exec(value);
      return match && `${match[3]}-${match[1]}-${match[2]}`;
    });
  }

  naics(field: string): string | null {
    return this.parsed(field, (value) =>
      /^\d{2,6}$/.test(value) ? value : null,
    );
  }

  ein(field: string): string {
    const value = this.required(field);
    return /^\d{9}$/.test(value) ? value : this.reject(field, value);
  }

  private parsed<T>(
    field: string,
    parse: (value: string) => T | null,
  ): T | null {
    const value = this.text(field);
    if (value === null) return null;
    const parsed = parse(value);
    if (parsed === null) this.nulled.push(field);
    return parsed;
  }

  private reject(field: string, value: string): never {
    throw new RejectedRow(`${field}: ${value}`);
  }
}
