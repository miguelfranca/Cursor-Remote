import { readTailscaleIdentity } from "../src/tailscale.js";

const identity = readTailscaleIdentity();
console.log(`Operator login: ${identity.login}`);
if (identity.bookmark) console.log(`Bookmark: ${identity.bookmark}`);
