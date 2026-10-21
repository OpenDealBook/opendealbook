import { afterAll, describe, expect, it } from 'vitest';

import { emailContractReviewReminders } from './reminder-email';
import {
  recordingNovu,
  removeEverythingSeeded,
  seedReview,
} from './test-support';

const EIGHT_UTC = new Date('2026-10-19T08:05:00Z');
const NINE_UTC = new Date('2026-10-19T09:05:00Z');
const EIGHT_NEW_YORK = new Date('2026-10-19T12:05:00Z');
const EIGHT_UTC_ON = (date: string) => new Date(`${date}T08:05:00Z`);

afterAll(removeEverythingSeeded, 120_000);

function recipients(sent: ReturnType<typeof recordingNovu>['sent']) {
  return sent.map((s) => s.data.to.subscriberId).sort();
}

describe('emailContractReviewReminders (integration)', () => {
  it("emails each side's counsel once a day at 8am UTC when they set no timezone, naming the deal by code name to buyer's counsel and business name to seller's counsel", async () => {
    const review = await seedReview({});
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );
    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );

    const reminder = (
      userId: string,
      email: string,
      side: string,
      version: number,
    ) => ({
      workflowId: 'contract-review.reminder',
      data: {
        to: { subscriberId: userId, email },
        payload: {
          dealName: side === 'buyer' ? review.codeName : 'Acme Tooling',
          subjectDealName: review.codeName,
          contractType: 'apa',
          version,
          since: 'Oct 18',
          path: `/counsel/${review.dealId}/contracts#contract-review-${review.versionId}`,
        },
        transactionId: `contract-review.reminder/${review.versionId}/${side}/${userId}/2026-10-19`,
      },
    });
    expect(
      sent
        .slice(0, 2)
        .sort((a, b) =>
          a.data.to.subscriberId.localeCompare(b.data.to.subscriberId),
        ),
    ).toEqual(
      [
        reminder(
          review.buyerCounsel.userId,
          review.buyerCounsel.email,
          'buyer',
          2,
        ),
        reminder(
          review.sellerCounsel.userId,
          review.sellerCounsel.email,
          'seller',
          1,
        ),
      ].sort((a, b) =>
        a.data.to.subscriberId.localeCompare(b.data.to.subscriberId),
      ),
    );
    expect(
      sent
        .slice(2)
        .map((s) => s.data.transactionId)
        .sort(),
    ).toEqual(
      sent
        .slice(0, 2)
        .map((s) => s.data.transactionId)
        .sort(),
    );
  });

  it('sends nothing outside 8am in the recipient timezone', async () => {
    const review = await seedReview({});
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      NINE_UTC,
    );

    expect(sent).toEqual([]);
  });

  it("sends at 8am in the recipient's own timezone, dated in it", async () => {
    const review = await seedReview({ sellerCounsel: false });
    await review.setTimezone(review.buyerCounsel.userId, 'America/New_York');
    await review.request('2026-10-19T02:00:00Z');
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );
    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_NEW_YORK,
    );

    const toCounsel = sent.filter(
      (s) => s.data.to.subscriberId === review.buyerCounsel.userId,
    );
    expect(
      toCounsel.map((s) => [s.data.transactionId, s.data.payload.since]),
    ).toEqual([
      [
        `contract-review.reminder/${review.versionId}/buyer/${review.buyerCounsel.userId}/2026-10-19`,
        'Oct 18',
      ],
    ]);
  });

  it('stops reminding a side that answered after the latest request, but not one that answered before it', async () => {
    const review = await seedReview({});
    await review.decide('buyer', '2026-10-18T04:00:00Z');
    await review.decide('seller', '2026-10-18T04:00:00Z');
    await review.request('2026-10-18T05:00:00Z');
    await review.decide('buyer', '2026-10-18T06:00:00Z');
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );

    expect(recipients(sent)).toEqual([review.sellerCounsel.userId]);
  });

  it('never reminds about a version that is no longer current', async () => {
    const review = await seedReview({});
    await review.supersede();
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );

    expect(sent).toEqual([]);
  });

  it('reminds the seller side only once the version is shared with them', async () => {
    const review = await seedReview({ shared: false });
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );

    expect(recipients(sent)).toEqual([review.buyerCounsel.userId]);
  });

  it("reminds a side's own party when it has no counsel", async () => {
    const review = await seedReview({
      buyerCounsel: false,
      sellerCounsel: false,
    });
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );

    expect(
      sent
        .map((s) => ({
          to: s.data.to.subscriberId,
          version: s.data.payload.version,
          path: s.data.payload.path,
        }))
        .sort((a, b) => a.to.localeCompare(b.to)),
    ).toEqual(
      [
        {
          to: review.owner.userId,
          version: 2,
          path: `/home/${review.slug}/deals/${review.dealId}/documents#contract-review-${review.versionId}`,
        },
        {
          to: review.seller.userId,
          version: 1,
          path: `/seller/rooms/${review.roomId}/contracts#contract-review-${review.versionId}`,
        },
      ].sort((a, b) => a.to.localeCompare(b.to)),
    );
  });

  it('sends nothing once the version is overridden for signing', async () => {
    const review = await seedReview({});
    await review.admin
      .from('contract_signing_override')
      .insert({
        account_id: review.teamId,
        contract_version_id: review.versionId,
        reason: 'Counsel approved by phone',
        overridden_by: review.owner.userId,
      })
      .throwOnError();
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );

    expect(sent).toEqual([]);
  });

  it('sends nothing once the deal no longer needs sign-off', async () => {
    const review = await seedReview({});
    await review.admin
      .from('deal_contract_review_gate_change')
      .insert({
        account_id: review.teamId,
        deal_id: review.dealId,
        contract_type: 'apa',
        was_required: true,
        required: false,
        changed_by: review.owner.userId,
      })
      .throwOnError();
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );

    expect(sent).toEqual([]);
  });

  it('sends nothing on an archived deal', async () => {
    const review = await seedReview({});
    await review.archive();
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );

    expect(sent).toEqual([]);
  });

  it('reminds daily on the five business days after the request day, never on a weekend', async () => {
    const review = await seedReview({ sellerCounsel: false, shared: false });
    const { novu, sent } = recordingNovu();

    for (const date of [
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]) {
      await emailContractReviewReminders(
        { admin: review.admin, novu },
        review.teamId,
        EIGHT_UTC_ON(date),
      );
    }

    expect(
      sent.map((s) => [
        s.data.to.subscriberId,
        s.data.transactionId!.split('/').at(-1),
      ]),
    ).toEqual(
      [
        '2026-10-19',
        '2026-10-20',
        '2026-10-21',
        '2026-10-22',
        '2026-10-23',
      ].map((date) => [review.buyerCounsel.userId, date]),
    );
  });

  it("tells the deal managers once, on the sixth business day, that counsel hasn't answered, in the app and by email", async () => {
    const review = await seedReview({ sellerCounsel: false, shared: false });
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC_ON('2026-10-26'),
    );
    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC_ON('2026-10-26'),
    );
    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC_ON('2026-10-27'),
    );

    const { data: notices } = await review.admin
      .from('notifications')
      .select('recipient_user_id, deal_id, body, link')
      .eq('account_id', review.teamId)
      .throwOnError();
    expect(notices).toEqual([
      {
        recipient_user_id: review.owner.userId,
        deal_id: review.dealId,
        body: "Buyer's counsel hasn't answered the review of version 2 of the APA on Acme Tooling asked for on Oct 18.",
        link: `/home/${review.slug}/deals/${review.dealId}/documents#contract-review-${review.versionId}`,
      },
    ]);
    const unanswered = {
      workflowId: 'contract-review.unanswered',
      data: {
        to: { subscriberId: review.owner.userId, email: undefined },
        payload: {
          dealName: 'Acme Tooling',
          contractType: 'apa',
          version: 2,
          side: 'buyer',
          since: 'Oct 18',
          path: `/home/${review.slug}/deals/${review.dealId}/documents#contract-review-${review.versionId}`,
        },
        transactionId: `contract-review.unanswered/${review.requestId}/buyer/${review.owner.userId}`,
      },
    };
    expect(sent).toEqual([unanswered, unanswered]);
  });

  it('reminds counsel weekly from the escalation day', async () => {
    const review = await seedReview({ sellerCounsel: false, shared: false });
    const { novu, sent } = recordingNovu();

    for (const date of [
      '2026-10-30',
      '2026-11-02',
      '2026-11-03',
      '2026-11-09',
    ]) {
      await emailContractReviewReminders(
        { admin: review.admin, novu },
        review.teamId,
        EIGHT_UTC_ON(date),
      );
    }

    expect(
      sent.map((s) => [
        s.workflowId,
        s.data.to.subscriberId,
        s.data.transactionId!.split('/').at(-1),
      ]),
    ).toEqual([
      ['contract-review.reminder', review.buyerCounsel.userId, '2026-11-02'],
      ['contract-review.reminder', review.buyerCounsel.userId, '2026-11-09'],
    ]);
  });

  it('tells no one counsel has not answered for a side without counsel', async () => {
    const review = await seedReview({
      buyerCounsel: false,
      sellerCounsel: false,
    });
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC_ON('2026-10-26'),
    );

    expect(sent).toEqual([]);
  });

  it('sends nothing to a team locked for billing', async () => {
    const review = await seedReview({});
    await review.admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', review.teamId)
      .throwOnError();
    const { novu, sent } = recordingNovu();

    await emailContractReviewReminders(
      { admin: review.admin, novu },
      review.teamId,
      EIGHT_UTC,
    );

    expect(sent).toEqual([]);
  });
});
