import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { searchHandler } from "@/lib/handlers";
import { createTestAgent, createTestService, run, signRequestHeaders, url } from "./harness";

const TARGET = url("/v1/agents-pay/search");
const BODY = JSON.stringify({ query: "tire" });

async function callSearch(
  service: ReturnType<typeof createTestService>,
  headers: Headers,
  body = BODY,
  target = TARGET,
) {
  return run(searchHandler(service), new Request(target, { method: "POST", headers, body }));
}

describe("agent request authentication", () => {
  it("accepts a correctly signed request", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const result = await callSearch(
      service,
      signRequestHeaders({ agent, method: "POST", url: TARGET, body: BODY }),
    );

    expect(result.status).toBe(200);
    expect(result.body.agentId).toBe(agent.agentId);
  });

  it("refuses a request with no proof at all", async () => {
    const service = createTestService();
    const result = await callSearch(service, new Headers({ "content-type": "application/json" }));
    expect(result.status).toBe(401);
  });

  it("refuses an invalid signature", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const headers = signRequestHeaders({ agent, method: "POST", url: TARGET, body: BODY });
    headers.set("x-signature", Buffer.from("not-a-signature").toString("base64url"));

    expect((await callSearch(service, headers)).status).toBe(401);
  });

  it("refuses a signature made by a key the registry does not know", async () => {
    const service = createTestService();
    const registered = createTestAgent();
    const impostor = createTestAgent(registered.agentId);
    service.registry.agents.set(registered.agentId, registered);

    const headers = signRequestHeaders({
      agent: registered,
      method: "POST",
      url: TARGET,
      body: BODY,
      privateKeyPem: impostor.privateKeyPem,
    });

    expect((await callSearch(service, headers)).status).toBe(401);
  });

  it("refuses an agent that is not registered", async () => {
    const service = createTestService();
    const agent = createTestAgent();

    const headers = signRequestHeaders({ agent, method: "POST", url: TARGET, body: BODY });
    expect((await callSearch(service, headers)).status).toBe(401);
  });

  it("refuses a key registered with the wrong algorithm", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    service.registry.agents.set(agent.agentId, {
      ...agent,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    const headers = signRequestHeaders({ agent, method: "POST", url: TARGET, body: BODY });
    expect((await callSearch(service, headers)).status).toBe(401);
  });

  it("refuses a proof signed for another HTTP method", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const headers = signRequestHeaders({ agent, method: "GET", url: TARGET, body: BODY });
    expect((await callSearch(service, headers)).status).toBe(401);
  });

  it("refuses a proof signed for another URL", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const headers = signRequestHeaders({
      agent,
      method: "POST",
      url: url("/v1/agents-pay/quotes"),
      body: BODY,
    });
    expect((await callSearch(service, headers)).status).toBe(401);
  });

  it("refuses a body modified after signing", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const headers = signRequestHeaders({ agent, method: "POST", url: TARGET, body: BODY });
    expect((await callSearch(service, headers, JSON.stringify({ query: "battery" }))).status).toBe(401);
  });

  it("refuses an expired proof", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const headers = signRequestHeaders({
      agent,
      method: "POST",
      url: TARGET,
      body: BODY,
      timestamp: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    expect((await callSearch(service, headers)).status).toBe(401);
  });

  it("refuses a proof timestamped in the future", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const headers = signRequestHeaders({
      agent,
      method: "POST",
      url: TARGET,
      body: BODY,
      timestamp: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    expect((await callSearch(service, headers)).status).toBe(401);
  });

  it("refuses an unparseable timestamp", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const headers = signRequestHeaders({ agent, method: "POST", url: TARGET, body: BODY });
    headers.set("x-timestamp", "not-a-date");
    expect((await callSearch(service, headers)).status).toBe(401);
  });

  it("refuses a reused nonce", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const headers = signRequestHeaders({
      agent,
      method: "POST",
      url: TARGET,
      body: BODY,
      nonce: "nonce_fixed_value",
    });

    expect((await callSearch(service, headers)).status).toBe(200);

    const replayed = signRequestHeaders({
      agent,
      method: "POST",
      url: TARGET,
      body: BODY,
      nonce: "nonce_fixed_value",
    });
    const second = await callSearch(service, replayed);
    expect(second.status).toBe(409);
    expect((second.body.error as { code: string }).code).toBe("REPLAYED_PROOF");
  });

  it("scopes a nonce to its agent so two agents may use the same value", async () => {
    const service = createTestService();
    const first = createTestAgent();
    const second = createTestAgent();
    service.registry.agents.set(first.agentId, first);
    service.registry.agents.set(second.agentId, second);

    const nonce = "nonce_shared_value";
    expect(
      (await callSearch(service, signRequestHeaders({ agent: first, method: "POST", url: TARGET, body: BODY, nonce })))
        .status,
    ).toBe(200);
    expect(
      (await callSearch(service, signRequestHeaders({ agent: second, method: "POST", url: TARGET, body: BODY, nonce })))
        .status,
    ).toBe(200);
  });

  it("fails closed when the registry is unavailable", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    const broken = { ...service, fetcher: (async () => new Response("", { status: 502 })) as typeof fetch };

    const headers = signRequestHeaders({ agent, method: "POST", url: TARGET, body: BODY });
    const result = await run(
      searchHandler(broken),
      new Request(TARGET, { method: "POST", headers, body: BODY }),
    );

    expect(result.status).toBe(503);
    expect((result.body.error as { code: string }).code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("rejects an oversized body before authenticating", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const huge = JSON.stringify({ query: "x".repeat(40_000) });
    const headers = signRequestHeaders({ agent, method: "POST", url: TARGET, body: huge });
    const result = await callSearch(service, headers, huge);

    expect(result.status).toBe(413);
  });
});

describe("error envelope", () => {
  it("always carries a code, a message and a request id", async () => {
    const service = createTestService();
    const result = await callSearch(service, new Headers({ "content-type": "application/json" }));
    const error = result.body.error as { code: string; message: string; requestId: string };

    expect(error.code).toBe("UNAUTHENTICATED");
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.requestId).toMatch(/^req_/);
    expect(result.headers.get("x-request-id")).toBe(error.requestId);
    expect(JSON.stringify(result.body)).not.toContain("PRIVATE KEY");
  });
});
