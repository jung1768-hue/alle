interface WorkerEnv {
  GEMINI_API_KEY?: string;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

async function handleGeminiApi(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === 'GET') {
    const available = Boolean(env.GEMINI_API_KEY?.trim());
    return new Response(
      JSON.stringify({ available, model: 'gemini-3.8-flash' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY is not configured on server.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: {
    prompt?: string;
    inlineData?: { data: string; mimeType: string };
    temperature?: number;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.prompt || typeof body.prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'prompt is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parts: Array<Record<string, unknown>> = [];
  if (body.inlineData?.data && body.inlineData?.mimeType) {
    parts.push({
      inlineData: {
        data: body.inlineData.data,
        mimeType: body.inlineData.mimeType,
      },
    });
  }
  parts.push({ text: body.prompt });

  const upstream = await fetch(
    `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 280,
          temperature:
            typeof body.temperature === 'number' ? body.temperature : 0.2,
        },
      }),
    }
  );

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    return new Response(
      JSON.stringify({
        error: `Gemini API error (${upstream.status})`,
        detail: errText.slice(0, 300),
      }),
      {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const data = (await upstream.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/gemini') {
      return handleGeminiApi(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
