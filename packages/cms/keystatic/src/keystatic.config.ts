import { collection, config, fields } from '@keystatic/core';

const statusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Review', value: 'review' },
];

function contentField() {
  return fields.markdoc({
    label: 'Content',
    options: {
      image: {
        directory: 'public/site/images',
        publicPath: '/site/images',
      },
    },
  });
}

function collectionSchema(relationshipCollection: string) {
  return {
    title: fields.slug({ name: { label: 'Title' } }),
    description: fields.text({ label: 'Description' }),
    publishedAt: fields.date({
      label: 'Published At',
      validation: { isRequired: true },
    }),
    status: fields.select({
      label: 'Status',
      defaultValue: 'draft',
      options: statusOptions,
    }),
    categories: fields.array(fields.text({ label: 'Category' }), {
      label: 'Categories',
    }),
    tags: fields.array(fields.text({ label: 'Tag' }), { label: 'Tags' }),
    image: fields.image({
      label: 'Image',
      directory: 'public/site/images',
      publicPath: '/site/images',
    }),
    order: fields.number({ label: 'Order' }),
    parent: fields.relationship({
      label: 'Parent',
      collection: relationshipCollection,
    }),
    content: contentField(),
  };
}

export const keystaticConfig = config({
  storage: { kind: 'local' },
  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'posts/*',
      format: { contentField: 'content' },
      schema: collectionSchema('posts'),
    }),
    documentation: collection({
      label: 'Documentation',
      slugField: 'title',
      path: 'documentation/**',
      format: { contentField: 'content' },
      schema: collectionSchema('documentation'),
    }),
  },
});
