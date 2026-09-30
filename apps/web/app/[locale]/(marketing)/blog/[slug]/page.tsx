import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import { renderMarkdoc, type MarkdocBody } from '@odb/cms';
import { createCmsClient } from '@odb/keystatic';
import { Badge } from '@odb/ui/badge';
import { Separator } from '@odb/ui/separator';

import appConfig from '~/config/app.config';

async function getPost(slug: string) {
  const cms = await createCmsClient();

  return cms.getContentItemBySlug({ slug, collection: 'posts' });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return {};
  }

  const url = `/blog/${post.slug}`;

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url,
      publishedTime: post.publishedAt,
      authors: post.author ? [post.author] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.publishedAt,
    author: post.author
      ? { '@type': 'Person', name: post.author }
      : undefined,
    image: post.cover ? `${appConfig.url}${post.cover}` : undefined,
  };

  return (
    <article className={'mx-auto w-full max-w-3xl px-6 py-16'}>
      <script
        type={'application/ld+json'}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className={'flex flex-col gap-3'}>
        <h1 className={'text-4xl font-bold'}>{post.title}</h1>
        {post.description ? (
          <p className={'text-muted-foreground text-lg'}>{post.description}</p>
        ) : null}
        <div className={'text-muted-foreground flex flex-wrap gap-x-3 text-sm'}>
          {post.author ? <span>{post.author}</span> : null}
          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString()}
          </time>
        </div>
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

      {post.cover ? (
        <div className={'relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-lg'}>
          <Image
            src={post.cover}
            alt={post.title}
            fill
            sizes={'(max-width: 768px) 100vw, 768px'}
            className={'object-cover'}
            priority
          />
        </div>
      ) : null}

      <Separator className={'my-8'} />

      <div className={'prose max-w-none'}>
        {renderMarkdoc(post.content as MarkdocBody)}
      </div>
    </article>
  );
}
