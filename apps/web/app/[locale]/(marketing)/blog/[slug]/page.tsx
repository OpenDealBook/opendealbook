import { notFound } from 'next/navigation';

import { createCmsClient } from '@tuckin/keystatic';

import { Badge } from '@tuckin/ui/badge';
import { Separator } from '@tuckin/ui/separator';

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;

  const cms = await createCmsClient();
  const post = await cms.getContentItemBySlug({ slug, collection: 'posts' });

  if (!post) {
    notFound();
  }

  return (
    <article className={'mx-auto w-full max-w-3xl px-6 py-16'}>
      <header className={'flex flex-col gap-3'}>
        <h1 className={'text-4xl font-bold'}>{post.title}</h1>
        {post.description ? (
          <p className={'text-lg text-muted-foreground'}>{post.description}</p>
        ) : null}
        <p className={'text-sm text-muted-foreground'}>
          {new Date(post.publishedAt).toLocaleDateString()}
        </p>
        {post.tags?.length ? (
          <div className={'flex flex-wrap gap-2'}>
            {post.tags.map((tag) => (
              <Badge key={tag} variant={'outline'}>
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </header>

      <Separator className={'my-8'} />

      <pre className={'whitespace-pre-wrap text-sm text-muted-foreground'}>
        {JSON.stringify(post.content, null, 2)}
      </pre>
    </article>
  );
}
