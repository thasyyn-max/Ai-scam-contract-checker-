/**
 * API-key admin CLI. In production, keys live in the container's DB volume, so run
 * this INSIDE the container:
 *
 *   docker compose exec app npm run key -w api -- create "Customer name" indie
 *   docker compose exec app npm run key -w api -- list
 *   docker compose exec app npm run key -w api -- revoke <id|prefix>
 *
 * Locally: npm run key -w api -- create "Test" free
 */
import { createApiKey, listKeys, revokeKey, getUsage, isTier, TIER_LIMITS } from '../src/apikeys.ts';

const [cmd, ...args] = process.argv.slice(2);

function help() {
  console.log(`RugSonar API-key admin
  create "<name>" [free|indie|pro]   issue a key (default: free)
  list                               list all keys + this month's usage
  revoke <id|prefix>                 deactivate a key`);
}

switch (cmd) {
  case 'create': {
    const name = args[0];
    const tier = args[1] ?? 'free';
    if (!name) { console.error('Error: name required — create "Customer name" [tier]'); process.exit(1); }
    if (!isTier(tier)) { console.error(`Error: tier must be free | indie | pro (got "${tier}")`); process.exit(1); }
    const { rawKey, id } = createApiKey(name, tier);
    console.log(`\n✅ Key #${id} issued for "${name}" — ${tier} tier (${TIER_LIMITS[tier].toLocaleString()} scans/mo)\n`);
    console.log(`   ${rawKey}\n`);
    console.log('⚠️  Copy it now — it is stored hashed and cannot be shown again.\n');
    break;
  }
  case 'list': {
    const keys = listKeys();
    if (!keys.length) { console.log('No API keys yet.'); break; }
    for (const k of keys) {
      const u = getUsage(k.id, k.tier);
      const status = k.active ? 'active ' : 'REVOKED';
      console.log(`#${k.id}  ${k.key_prefix}…  ${k.tier.padEnd(5)}  ${status}  ${u.used}/${u.limit} this month  ${k.name}`);
    }
    break;
  }
  case 'revoke': {
    if (!args[0]) { console.error('Error: id or prefix required'); process.exit(1); }
    revokeKey(args[0]);
    console.log(`Revoked "${args[0]}" (if it existed).`);
    break;
  }
  default:
    help();
}
