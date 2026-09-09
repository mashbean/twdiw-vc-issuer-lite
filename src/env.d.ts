// Bindings `wrangler types` cannot see. `GITHUB_TOKEN` is optional: the monitor
// reads five public repositories once a day, which fits inside GitHub's
// anonymous rate limit, so a deployment works without it. Set it with
// `wrangler secret put GITHUB_TOKEN` if the anonymous limit ever bites.
interface Env {
  GITHUB_TOKEN?: string;
}
