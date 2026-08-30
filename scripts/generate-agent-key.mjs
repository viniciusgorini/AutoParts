#!/usr/bin/env node
// Generates a development Ed25519 agent key pair in PEM form.
// The public key must be registered with AgentPay for the registry lookup to
// succeed; the private key goes into AUTOPARTS_DEMO_AGENT_PRIVATE_KEY.
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

console.log(privateKey.export({ type: "pkcs8", format: "pem" }).toString());
console.log(publicKey.export({ type: "spki", format: "pem" }).toString());
