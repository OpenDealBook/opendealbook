import { notFound, type Handler } from './http';

interface ChatRequest {
  model: string;
  messages: { role: string; content: string }[];
}

export function llmStandIn(): Handler {
  const replies = new Map<string, string>();
  const requests: ChatRequest[] = [];

  return (request) => {
    const reply = request.path.match(/^\/__e2e\/replies\/(.+)$/);

    if (request.method === 'PUT' && reply) {
      const { content }: { content: string } = JSON.parse(request.body);
      replies.set(decodeURIComponent(reply[1]!), content);
      return { status: 204, json: null };
    }

    if (request.method === 'GET' && request.path === '/__e2e/requests') {
      const model = request.query.get('model');
      return {
        status: 200,
        json: requests.filter((chat) => chat.model === model),
      };
    }

    if (request.method === 'POST' && request.path === '/v1/chat/completions') {
      const chat: ChatRequest = JSON.parse(request.body);
      requests.push(chat);
      const content = replies.get(chat.model);

      if (content === undefined) {
        return notFound(request, `no reply set for model ${chat.model}`);
      }

      return {
        status: 200,
        json: {
          id: `chatcmpl-e2e-${requests.length}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: chat.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        },
      };
    }

    return notFound(request);
  };
}
