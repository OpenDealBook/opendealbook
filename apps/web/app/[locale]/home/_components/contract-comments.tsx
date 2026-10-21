'use client';

import { type FormEvent, useId, useState } from 'react';

import type {
  CommentAuthorRole,
  CommentThread,
  ContractComment,
} from '@odb/contracts';
import {
  addContractComment,
  reopenContractComment,
  replyToContractComment,
  resolveContractComment,
} from '@odb/contracts/server';
import { itemAnchor } from '@odb/notifications/relay';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { useLiveRefresh } from './use-live-refresh';
import { useRefusableAction } from './use-refusable-action';

type Side = ContractComment['side'];

const ROLE_LABEL: Record<CommentAuthorRole, string> = {
  team: 'Buyer',
  buyer_counsel: "Buyer's counsel",
  seller_counsel: "Seller's counsel",
  seller: 'Seller',
};

function authorLabel({ author }: ContractComment) {
  const role = ROLE_LABEL[author.role];

  return author.name === null ? role : `${author.name} (${role})`;
}

function Refusal({ refusal }: { refusal: string | null }) {
  return refusal ? (
    <span role={'alert'} className={'text-destructive text-sm'}>
      {refusal}
    </span>
  ) : null;
}

function InternalToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <span className={'flex items-center gap-2'}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(state) => onChange(state === true)}
      />
      <Label htmlFor={id}>Internal (buyer side only)</Label>
    </span>
  );
}

function Comment({ comment }: { comment: ContractComment }) {
  return (
    <article data-comment className={'flex flex-col gap-1'}>
      <span className={'flex items-center gap-2 text-sm'}>
        <span data-author className={'font-medium'}>
          {authorLabel(comment)}
        </span>
        {comment.internal ? (
          <Badge variant={'secondary'}>Internal</Badge>
        ) : null}
      </span>
      {comment.quotedText ? (
        <blockquote
          className={'text-muted-foreground border-l-2 pl-3 text-sm italic'}
        >
          {comment.quotedText}
        </blockquote>
      ) : null}
      <p data-body className={'text-sm whitespace-pre-wrap'}>
        {comment.body}
      </p>
    </article>
  );
}

function ReplyForm({
  thread,
  viewerSide,
}: {
  thread: CommentThread;
  viewerSide: Side;
}) {
  const id = useId();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const { refusal, pending: isPending, run } = useRefusableAction();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    run(
      () => replyToContractComment({ parentId: thread.id, body, internal }),
      () => setBody((current) => (current === body ? '' : current)),
    );
  }

  return (
    <form className={'flex flex-col gap-2'} onSubmit={onSubmit}>
      <Label htmlFor={id}>Reply</Label>
      <Textarea
        id={id}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className={'flex items-center gap-3'}>
        {viewerSide === 'buyer' && !thread.internal ? (
          <InternalToggle checked={internal} onChange={setInternal} />
        ) : null}
        <Button
          type={'submit'}
          size={'sm'}
          variant={'outline'}
          disabled={!body.trim() || isPending}
        >
          Reply
        </Button>
        <Refusal refusal={refusal} />
      </div>
    </form>
  );
}

function ResolveControl({ thread }: { thread: CommentThread }) {
  const { refusal, pending: isPending, run } = useRefusableAction();
  const commentId = thread.id;

  return (
    <span className={'flex items-center gap-2'}>
      <Button
        type={'button'}
        size={'sm'}
        variant={'ghost'}
        disabled={isPending}
        onClick={() =>
          run(() =>
            thread.resolved
              ? reopenContractComment({ commentId })
              : resolveContractComment({ commentId }),
          )
        }
      >
        {thread.resolved ? 'Reopen' : 'Resolve'}
      </Button>
      <Refusal refusal={refusal} />
    </span>
  );
}

function Thread({
  thread,
  viewerSide,
}: {
  thread: CommentThread;
  viewerSide: Side | null;
}) {
  const body = (
    <div className={'flex flex-col gap-3'}>
      <Comment comment={thread} />
      {thread.replies.length > 0 ? (
        <ul className={'flex flex-col gap-3 border-l pl-4'}>
          {thread.replies.map((reply) => (
            <li
              key={reply.id}
              id={itemAnchor({ kind: 'contract-comment', id: reply.id })}
            >
              <Comment comment={reply} />
            </li>
          ))}
        </ul>
      ) : null}
      {viewerSide === thread.side ? <ResolveControl thread={thread} /> : null}
      {viewerSide ? (
        <ReplyForm thread={thread} viewerSide={viewerSide} />
      ) : null}
    </div>
  );

  return (
    <li
      id={itemAnchor({ kind: 'contract-comment', id: thread.id })}
      data-thread={thread.id}
      className={'rounded-md border p-3'}
    >
      {thread.resolved ? (
        <details>
          <summary className={'text-muted-foreground cursor-pointer text-sm'}>
            Resolved: {authorLabel(thread)}
          </summary>
          <div className={'mt-3'}>{body}</div>
        </details>
      ) : (
        body
      )}
    </li>
  );
}

function NewCommentForm({
  contractVersionId,
  viewerSide,
}: {
  contractVersionId: string;
  viewerSide: Side;
}) {
  const quotedId = useId();
  const bodyId = useId();
  const [quotedText, setQuotedText] = useState('');
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const { refusal, pending: isPending, run } = useRefusableAction();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    run(
      () =>
        addContractComment({
          contractVersionId,
          quotedText: quotedText || undefined,
          body,
          internal,
        }),
      () => {
        setQuotedText('');
        setBody((current) => (current === body ? '' : current));
      },
    );
  }

  return (
    <form
      data-new-comment
      className={'flex flex-col gap-2'}
      onSubmit={onSubmit}
    >
      <Label htmlFor={quotedId}>Quoted text (optional)</Label>
      <Input
        id={quotedId}
        value={quotedText}
        onChange={(event) => setQuotedText(event.target.value)}
      />
      <Label htmlFor={bodyId}>Comment</Label>
      <Textarea
        id={bodyId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className={'flex items-center gap-3'}>
        {viewerSide === 'buyer' ? (
          <InternalToggle checked={internal} onChange={setInternal} />
        ) : null}
        <Button
          type={'submit'}
          size={'sm'}
          disabled={!body.trim() || isPending}
        >
          Post comment
        </Button>
        <Refusal refusal={refusal} />
      </div>
    </form>
  );
}

export function ContractComments({
  contractVersionId,
  threads,
  viewer,
}: {
  contractVersionId: string;
  threads: CommentThread[];
  viewer: { side: Side } | null;
}) {
  useLiveRefresh('contract_comment', 'contract_version_id', contractVersionId);

  return (
    <section className={'flex flex-col gap-3'}>
      {threads.length > 0 ? (
        <ul className={'flex flex-col gap-3'}>
          {threads.map((thread) => (
            <Thread
              key={thread.id}
              thread={thread}
              viewerSide={viewer?.side ?? null}
            />
          ))}
        </ul>
      ) : (
        <p className={'text-muted-foreground text-sm'}>No comments yet.</p>
      )}
      {viewer ? (
        <NewCommentForm
          contractVersionId={contractVersionId}
          viewerSide={viewer.side}
        />
      ) : null}
    </section>
  );
}
