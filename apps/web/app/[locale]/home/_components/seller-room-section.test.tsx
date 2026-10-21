import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@odb/supabase/server', () => ({}));
vi.mock('@odb/lender-rooms/rooms/closing.ts', () => ({}));
vi.mock('@odb/seller-rooms/activity/queries.ts', () => ({}));
vi.mock('@odb/seller-rooms/folders/queries.ts', () => ({}));
vi.mock('@odb/seller-rooms/meetings/queries.ts', () => ({}));
vi.mock('@odb/seller-rooms/members/people.ts', () => ({}));
vi.mock('@odb/seller-rooms/questions/queries.ts', () => ({}));
vi.mock('./ask-the-seller', () => ({}));
vi.mock('./seller-room-activity', () => ({}));
vi.mock('./seller-room-folders', () => ({}));
vi.mock('./seller-room-invite', () => ({}));
vi.mock('./seller-room-lifecycle', () => ({}));
vi.mock('./seller-room-meetings', () => ({}));
vi.mock('./seller-room-people', () => ({}));
vi.mock('./seller-room-questions', () => ({}));

import { SellerCounselComments } from './seller-room-section';

describe('SellerCounselComments', () => {
  it("shows each comment from seller's counsel with its author label and what it is on", () => {
    const html = renderToStaticMarkup(
      <SellerCounselComments
        comments={[
          {
            id: 'c-1',
            author: "Owen Castillo, Walt's counsel",
            body: 'Already covered in the APA',
            subject: 'Customer list?',
          },
        ]}
      />,
    );

    expect(html).toContain("Seller&#x27;s counsel comments");
    expect(html).toContain(
      'Owen Castillo, Walt&#x27;s counsel on Customer list?',
    );
    expect(html).toContain('Already covered in the APA');
  });
});
