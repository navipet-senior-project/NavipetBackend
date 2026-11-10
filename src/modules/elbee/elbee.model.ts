import type { Environment } from '../../config/env.js';

export const ELBEE_MODELS = {
  'claude-haiku-5-5': { inputPerMillion: 0.1, outputPerMillion: 0.5 },
  'claude-sonnet-5-5': { inputPerMillion: 2, outputPerMillion: 10 },
} as const;

export type ElbeeModelId = keyof typeof ELBEE_MODELS;

export const ELBEE_MAX_INPUT_TOKENS = 8_000;
export const ELBEE_MAX_OUTPUT_TOKENS = 1_024;

/** Published global prices times 1.1 so a US-only account still fits the reserve. */
export function worstCaseMicros(model: ElbeeModelId): number {
  const price = ELBEE_MODELS[model];
  const globalMicros =
    ELBEE_MAX_INPUT_TOKENS * price.inputPerMillion +
    ELBEE_MAX_OUTPUT_TOKENS * price.outputPerMillion;
  return Math.ceil(globalMicros * 1.1);
}

export type ElbeeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string };

export interface ElbeeMessage {
  role: 'user' | 'assistant';
  content: ElbeeContentBlock[];
}

export interface ElbeeToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ElbeeModelTurn {
  system: string;
  messages: readonly ElbeeMessage[];
  tools: readonly ElbeeToolDefinition[];
  maxTokens: number;
  signal: AbortSignal;
}

export interface ElbeeModelResult {
  toolUses: { id: string; name: string; input: unknown }[];
  text: string;
}

export interface ElbeeModel {
  complete(turn: ElbeeModelTurn): Promise<ElbeeModelResult>;
}

export function elbeeModelId(value: string | undefined): ElbeeModelId | null {
  if (value === 'claude-haiku-5-5' || value === 'claude-sonnet-5-5') return value;
  return null;
}

export function elbeeLiveReady(
  env: Environment,
  hasAdminClient: boolean,
): env is Environment & { ANTHROPIC_API_KEY: string; ELBEE_MODEL: string } {
  return (
    env.ELBEE_PROVIDER === 'anthropic' &&
    env.ANTHROPIC_API_KEY !== undefined &&
    elbeeModelId(env.ELBEE_MODEL) !== null &&
    env.ELBEE_GLOBAL_DAILY_MICROS > 0 &&
    env.ELBEE_USER_DAILY_MICROS > 0 &&
    env.ELBEE_USER_DAILY_MICROS <= env.ELBEE_GLOBAL_DAILY_MICROS &&
    hasAdminClient
  );
}

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

export function createAnthropicModel(
  apiKey: string,
  model: ElbeeModelId,
  fetchImpl: typeof fetch = fetch,
): ElbeeModel {
  return {
    async complete(turn) {
      let response: Response;
      try {
        response = await fetchImpl(MESSAGES_URL, {
          method: 'POST',
          redirect: 'error',
          signal: turn.signal,
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: turn.maxTokens,
            system: turn.system,
            tools: turn.tools.map((tool) => ({ ...tool, strict: true })),
            messages: turn.messages.map((message) => ({
              role: message.role,
              content: message.content.map((block) => {
                if (block.type === 'tool_result') {
                  return {
                    type: 'tool_result',
                    tool_use_id: block.toolUseId,
                    content: block.content,
                  };
                }
                if (block.type === 'tool_use') {
                  return {
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input,
                  };
                }
                return { type: 'text', text: block.text };
              }),
            })),
          }),
        });
      } catch (cause) {
        if (turn.signal.aborted) throw cause;
        throw new Error('Campus assistant model is unavailable', { cause });
      }
      if (!response.ok) throw new Error('Campus assistant model is unavailable');
      const body: unknown = await response.json();
      return parseAnthropicBody(body);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAnthropicBody(body: unknown): ElbeeModelResult {
  if (!isRecord(body) || !Array.isArray(body.content)) {
    throw new Error('Campus assistant model reply was unreadable');
  }
  const toolUses: ElbeeModelResult['toolUses'] = [];
  const text: string[] = [];
  for (const block of body.content) {
    if (!isRecord(block) || typeof block.type !== 'string') {
      throw new Error('Campus assistant model reply was unreadable');
    }
    if (block.type === 'text' && typeof block.text === 'string') text.push(block.text);
    if (block.type === 'tool_use') {
      if (typeof block.id !== 'string' || typeof block.name !== 'string') {
        throw new Error('Campus assistant model reply was unreadable');
      }
      toolUses.push({ id: block.id, name: block.name, input: block.input });
    }
  }
  return { toolUses, text: text.join('\n') };
}
