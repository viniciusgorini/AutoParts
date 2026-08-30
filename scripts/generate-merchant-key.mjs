#!/usr/bin/env node
// Generates a development Ed25519 key pair for AutoParts quote signing.
// The private JWK goes into AGENTPAY_MERCHANT_PRIVATE_JWK (server-only).
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

console.log("AGENTPAY_MERCHANT_PRIVATE_JWK=" + JSON.stringify(privateKey.export({ format: "jwk" })));
console.log();
console.log("# Public JWK (safe to publish):");
console.log("# " + JSON.stringify(publicKey.export({ format: "jwk" })));
