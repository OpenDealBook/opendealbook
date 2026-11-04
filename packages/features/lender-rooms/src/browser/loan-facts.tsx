import { Fragment } from 'react';

import { FigureValue } from '@odb/ui/figure-value';
import { formatDate } from '@odb/ui/format';

import { type LoanAsk, loanAskParts } from './header-facts';

export function LoanAskFigures({ loan }: { loan: LoanAsk }) {
  return loanAskParts(loan, (amount) => (
    <FigureValue value={amount} format={'money'} />
  )).map((part, index) => <Fragment key={index}>{part}</Fragment>);
}

export function CloseByDate({
  isoDate,
  locale,
}: {
  isoDate: string;
  locale: string;
}) {
  return <time dateTime={isoDate}>{formatDate(isoDate, locale)}</time>;
}
