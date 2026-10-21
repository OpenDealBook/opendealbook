import {
  type ContractReview,
  ContractReviewPanel,
} from './contract-review-panel';

const TYPE_LABEL = { loi: 'LOI', apa: 'APA' };

export function OfferCounselSignOff({
  reviews,
}: {
  reviews: {
    type: 'loi' | 'apa';
    contractVersionId: string;
    review: ContractReview;
  }[];
}) {
  return reviews.map(({ type, contractVersionId, review }) => (
    <section
      key={contractVersionId}
      className={'flex flex-col gap-2 rounded-md border p-3'}
    >
      <h4 className={'text-sm font-medium'}>
        {TYPE_LABEL[type]} counsel sign-off
      </h4>
      <ContractReviewPanel
        contractVersionId={contractVersionId}
        review={review}
        canManage={false}
      />
    </section>
  ));
}
