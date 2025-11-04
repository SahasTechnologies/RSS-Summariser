// Cloudflare Pages Function: /functions/summarize.js
// Adapted from cf-worker.js to use Pages Functions API (onRequest).
// Expects HF_API_KEY to be set in Pages environment (Secrets / Environment variables).

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST with JSON { "text": "..." }' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let body;
  const ct = request.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      body = await request.json();
    } else {
      // try text or raw body
      const t = await request.text();
      try { body = JSON.parse(t); } catch { body = { text: t }; }
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request body', details: String(err) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const input = body.text || body.input || body.data;
  if (!input || typeof input !== 'string') {
    return new Response(JSON.stringify({ error: 'Request JSON must include a `text` string field' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const hfKey = env.HF_API_KEY;
  if (!hfKey) {
    return new Response(JSON.stringify({ error: 'Missing HF_API_KEY in environment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // Optional parameters can be passed in request JSON under `parameters`
  const parameters = body.parameters || { max_length: 142, min_length: 56, do_sample: false };

  // Small safety: prevent enormous requests
  const MAX_INPUT_CHARS = 20000;
  if (input.length > MAX_INPUT_CHARS) {
    return new Response(JSON.stringify({ error: `Input too large; limit ${MAX_INPUT_CHARS} characters` }), {
      status: 413,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    const hfResponse = await fetch('https://api-inference.huggingface.co/models/facebook/bart-large-cnn', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ inputs: input, parameters }),
    });

    const text = await hfResponse.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    if (!hfResponse.ok) {
      return new Response(JSON.stringify({ error: 'Hugging Face API error', details: parsed }), {
        status: hfResponse.status || 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    let summary = null;
    if (Array.isArray(parsed) && parsed.length && parsed[0].summary_text) {
      summary = parsed[0].summary_text;
    } else if (parsed && parsed.summary_text) {
      summary = parsed.summary_text;
    } else if (typeof parsed === 'string') {
      summary = parsed;
    } else {
      summary = JSON.stringify(parsed);
    }

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Request failed', details: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}
