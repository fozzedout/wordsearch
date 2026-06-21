// Minimal Cloudflare Worker. The word search game is a fully static, client-side
// app, so the Worker just hands every request to the static assets binding.
// (The ASSETS binding is configured in wrangler.jsonc.)

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
