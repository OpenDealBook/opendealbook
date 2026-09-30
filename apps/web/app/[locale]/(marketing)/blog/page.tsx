import Image from 'next/image';
import Link from 'next/link';

import { createCmsClient } from '@odb/keystatic';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

export default async function BlogPage() {
  const cms = await createCmsClient();
  const { items } = await cms.getContentItems({
    collection: 'posts',
    status: 'published',
    sortBy: 'publishedAt',
    sortDirection: 'desc',
  });

  return (
    <section className={'mx-auto w-full max-w-4xl px-6 py-16'}>
      <div className={'flex flex-col gap-3'}>
        <h1 className={'text-4xl font-bold'}>Blog</h1>
        <p className={'text-muted-foreground'}>
          News, updates, and thoughts from the Open Deal Book team.
        </p>
      </div>

      {items.length === 0 ? (
        <p className={'text-muted-foreground mt-12'}>
          No posts published yet. Check back soon.
        </p>
      ) : (
        <div className={'mt-12 flex flex-col gap-6'}>
          {items.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`}>
              <Card className={'overflow-hidden'}>
                {post.cover ? (
                  <div className={'relative aspect-[16/9] w-full'}>
                    <Image
                      src={post.cover}
                      alt={post.title}
                      fill
                      sizes={'(max-width: 768px) 100vw, 768px'}
                      className={'object-cover'}
                    />
                  </div>
                ) : null}
                <CardHeader>
                  <CardTitle>{post.title}</CardTitle>
                  {post.description ? (
                    <CardDescription>{post.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent
                  className={
                    'text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-sm'
                  }
                >
                  {post.author ? <span>{post.author}</span> : null}
                  {post.category ? <span>{post.category}</span> : null}
                  <time dateTime={post.publishedAt}>
                    {new Date(post.publishedAt).toLocaleDateString()}
                  </time>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
