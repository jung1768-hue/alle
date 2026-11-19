interface PagesContext {
  request: Request;
  env: {
    GEMINI_API_KEY?: string;
  };
}

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const available = Boolean(context.env?.GEMINI_API_KEY?.trim());
  return new Response(
    JSON.stringify({ available, model: 'gemini-3.8-flash' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const apiKey = context.env?.GEMINI_API_KEY?.trim();
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
    body = (await context.request.json()) as typeof body;
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
