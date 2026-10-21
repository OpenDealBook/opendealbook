import { afterAll, describe, expect, it } from 'vitest';

import { removeEverythingSeeded, seedReview } from './test-support';
import { syncContractReviewTodos } from './todo-sync';

afterAll(removeEverythingSeeded, 120_000);

async function todosOf(review: Awaited<ReturnType<typeof seedReview>>) {
  const { data } = await review.admin
    .from('personal_todo')
    .select('id, user_id, deal_id, title')
    .eq('account_id', review.teamId)
    .order('title')
    .throwOnError();

  return data;
}

describe('syncContractReviewTodos (integration)', () => {
  it("gives each deal manager one to-do per side still waiting, dated in the manager's timezone", async () => {
    const review = await seedReview({});
    await review.setTimezone(review.owner.userId, 'America/New_York');

    await syncContractReviewTodos(review.admin, review.teamId);
    await syncContractReviewTodos(review.admin, review.teamId);

    expect((await todosOf(review)).map(({ user_id, deal_id, title }) => ({ user_id, deal_id, title }))).toEqual([
      { user_id: review.owner.userId, deal_id: review.dealId, title: "Waiting on buyer's counsel since Oct 17" },
      { user_id: review.owner.userId, deal_id: review.dealId, title: "Waiting on seller's counsel since Oct 17" },
    ]);
  });

  it('asks the team to share the version until the seller side can see it, then waits on them', async () => {
    const review = await seedReview({ shared: false });

    await syncContractReviewTodos(review.admin, review.teamId);
    const beforeShare = (await todosOf(review)).map((todo) => todo.title);
    await review.share();
    await syncContractReviewTodos(review.admin, review.teamId);

    expect(beforeShare).toEqual([
      'Share version 2 with the seller side',
      "Waiting on buyer's counsel since Oct 18",
    ]);
    expect((await todosOf(review)).map((todo) => todo.title)).toEqual([
      "Waiting on buyer's counsel since Oct 18",
      "Waiting on seller's counsel since Oct 18",
    ]);
  });

  it('clears the to-do once that side answers', async () => {
    const review = await seedReview({});
    await syncContractReviewTodos(review.admin, review.teamId);

    await review.decide('seller', '2026-10-18T06:00:00Z');
    await syncContractReviewTodos(review.admin, review.teamId);

    expect((await todosOf(review)).map((todo) => todo.title)).toEqual([
      "Waiting on buyer's counsel since Oct 18",
    ]);
  });

  it('clears the to-dos once a newer version replaces it', async () => {
    const review = await seedReview({});
    await syncContractReviewTodos(review.admin, review.teamId);

    await review.supersede();
    await syncContractReviewTodos(review.admin, review.teamId);

    expect(await todosOf(review)).toEqual([]);
  });

  it('does not make again a to-do the manager deleted by hand', async () => {
    const review = await seedReview({ sellerCounsel: false });
    await syncContractReviewTodos(review.admin, review.teamId);
    const [deleted] = await todosOf(review);
    await review.admin.from('personal_todo').delete().eq('id', deleted!.id).throwOnError();

    await syncContractReviewTodos(review.admin, review.teamId);

    expect((await todosOf(review)).map((todo) => todo.title)).not.toContain(deleted!.title);
  });

  it('dates a fresh to-do from a newer request', async () => {
    const review = await seedReview({ sellerCounsel: false, buyerCounsel: true });
    await review.decide('seller', '2026-10-18T04:00:00Z');
    await syncContractReviewTodos(review.admin, review.teamId);

    await review.request('2026-10-19T05:00:00Z');
    await syncContractReviewTodos(review.admin, review.teamId);

    expect((await todosOf(review)).map((todo) => todo.title)).toEqual([
      "Waiting on buyer's counsel since Oct 19",
      'Waiting on the seller since Oct 19',
    ]);
  });
});
