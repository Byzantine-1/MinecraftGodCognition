function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function readContentPart(part) {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return null;
  if (typeof part.text === 'string' && part.text.trim().length > 0) return part.text.trim();
  return null;
}

function readMessageContent(message) {
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }

  if (Array.isArray(message)) {
    const segments = message
      .map(readContentPart)
      .filter(segment => typeof segment === 'string' && segment.length > 0);
    return segments.length > 0 ? segments.join('\n') : null;
  }

  return null;
}

/**
 * Build the Qwen immersion provider.
 * The current adapter targets an OpenAI-compatible chat completions endpoint.
 * @returns {Object}
 */
export function createQwenProvider() {
  return Object.freeze({
    name: 'qwen',
    async generate({ prompt, config, fetchImpl = globalThis.fetch }) {
      if (!config || typeof config !== 'object') {
        throw new Error('Missing Qwen configuration');
      }
      if (typeof config.apiKey !== 'string' || config.apiKey.length === 0) {
        throw new Error('Missing Qwen API key');
      }
      if (typeof config.baseUrl !== 'string' || config.baseUrl.length === 0) {
        throw new Error('Missing Qwen base URL');
      }
      if (typeof config.model !== 'string' || config.model.length === 0) {
        throw new Error('Missing Qwen model');
      }
      if (!prompt || typeof prompt !== 'object') {
        throw new Error('Missing immersion prompt');
      }
      if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch implementation is required');
      }

      const response = await fetchImpl(`${trimTrailingSlash(config.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          top_p: 1,
          stream: false,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user }
          ]
        })
      });

      if (!response || response.ok !== true) {
        const status = response?.status ?? 0;
        const statusText = response?.statusText ?? 'Unknown error';
        throw new Error(`Qwen request failed: ${status} ${statusText}`.trim());
      }

      const payload = await response.json();
      const content = readMessageContent(payload?.choices?.[0]?.message?.content);

      if (!content) {
        throw new Error('Qwen response did not include message content');
      }

      return {
        content,
        model: config.model
      };
    }
  });
}
