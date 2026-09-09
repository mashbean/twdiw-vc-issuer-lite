// Bindings `wrangler types` cannot see. `GITHUB_TOKEN` is optional: the monitor
// reads five public repositories once a day, which fits inside GitHub's
// anonymous rate limit, so a deployment works without it. Set it with
// `wrangler secret put GITHUB_TOKEN` if the anonymous limit ever bites.
interface Env {
  GITHUB_TOKEN?: string;
  /** Optional Arbitrum RPC with an API key (`wrangler secret put
   *  ARBITRUM_RPC_URL`). The free public endpoints rate-limit Cloudflare's
   *  shared egress addresses, so the on-chain panel is only reliably complete
   *  when one of these is set; without it the monitor still tries the public
   *  endpoints and reports whatever it could not check as unavailable. */
  ARBITRUM_RPC_URL?: string;
}
