import {
  type FigureFormat,
  FigureValue,
  MissingValue,
} from '@odb/ui/figure-value';

export type Shown =
  | { kind: FigureFormat; value: number | null }
  | { kind: 'text'; value: string | null };

export function ShownValue(props: { shown: Shown; calculated?: boolean }) {
  const { shown, calculated = false } = props;
  if (shown.value === null) {
    return <MissingValue calculated={calculated} />;
  }
  return shown.kind === 'text' ? (
    shown.value
  ) : (
    <FigureValue value={shown.value} format={shown.kind} />
  );
}
