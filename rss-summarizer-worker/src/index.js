// the cloudflare worker
// the whole point of this 67 ( ͡ ° ͜ʖ ͡ °) line file is just to secure an api key
// so that it is not exposed to the client side
// but either way my worker is public so i dont see the point
export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { text } = await request.json();
      
      if (!text) {
        return new Response('Missing text in request body', { 
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Forward to HuggingFace with our API key
      const hfResponse = await fetch(
        'https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.HF_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: text }),
        }
      );

      const data = await hfResponse.text();

      // Return the HF response with CORS headers
      return new Response(data, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        status: hfResponse.status,
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });
    }
  },
};