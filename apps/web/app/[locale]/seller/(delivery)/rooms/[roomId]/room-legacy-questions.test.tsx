import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RoomLegacyQuestions } from './room-legacy-questions';

describe('RoomLegacyQuestions', () => {
  it('shows earlier questions and their answers without a way to answer', () => {
    const html = renderToStaticMarkup(
      <RoomLegacyQuestions
        questions={[
          {
            id: 'l-1',
            question: 'Old portal question',
            answer: 'Old answer',
            answered_at: null,
          },
          {
            id: 'l-2',
            question: 'Unanswered',
            answer: null,
            answered_at: null,
          },
        ]}
      />,
    );

    expect(html).toContain('Earlier questions');
    expect(html).toContain('Old portal question');
    expect(html).toContain('Old answer');
    expect(html).toContain('Not answered');
    expect(html).not.toContain('<textarea');
  });

  it('shows nothing when there are no earlier questions', () => {
    expect(renderToStaticMarkup(<RoomLegacyQuestions questions={[]} />)).toBe(
      '',
    );
  });
});
