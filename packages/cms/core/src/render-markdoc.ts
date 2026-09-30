import Markdoc, { type Node } from '@markdoc/markdoc';
import { createElement, Fragment, type ReactNode } from 'react';

export type MarkdocBody = string | { node: Node };

export function renderMarkdoc(body: MarkdocBody): ReactNode {
  const node = typeof body === 'string' ? Markdoc.parse(body) : body.node;
  const renderable = Markdoc.transform(node);

  return Markdoc.renderers.react(renderable, { createElement, Fragment });
}
