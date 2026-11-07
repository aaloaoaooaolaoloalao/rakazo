import { describe, expect, it } from "vitest";
import { ComposioConnector } from "./composio-connector.js";
import { FakeComposioClient as FakeClient } from "./composio-fake.js";

function connector(fake: FakeClient) {
  return new ComposioConnector({ client: fake, apiKey: "fake-key-for-http-fallback" });
}

function addAccount(fake: FakeClient, userId: string, toolkit: string) {
  const id = `ca_${userId}_${toolkit}_${fake.accounts.length}`;
  fake.accounts.push({
    id,
    userId,
    toolkit: toolkit.toLowerCase(),
    status: "ACTIVE",
  });
  return id;
}

describe("ComposioConnector.purgeUserConnectedAccounts", () => {
  it("revokes and deletes each connected account for the user", async () => {
    const fake = new FakeClient();
    const gmail = addAccount(fake, "user-1", "GMAIL");
    const github = addAccount(fake, "user-1", "GITHUB");
    addAccount(fake, "user-2", "GMAIL");

    await connector(fake).purgeUserConnectedAccounts("user-1");

    expect(fake.providerRevokes.sort()).toEqual([gmail, github].sort());
    expect(fake.deletedWithRevokeOnDelete.sort()).toEqual([gmail, github].sort());
    expect(fake.accounts.map((account) => account.id)).toEqual([`ca_user-2_GMAIL_2`]);
  });

  it("continues when revoke fails for one toolkit", async () => {
    const fake = new FakeClient();
    fake.revokeShouldFailForToolkit = "slack";
    const gmail = addAccount(fake, "user-1", "GMAIL");
    const slack = addAccount(fake, "user-1", "SLACK");

    await connector(fake).purgeUserConnectedAccounts("user-1");

    expect(fake.providerRevokes).toEqual([gmail]);
    expect(fake.deletedWithRevokeOnDelete.sort()).toEqual([gmail, slack].sort());
    expect(fake.accounts).toEqual([]);
  });

  it("is a no-op when the user has no Composio connections", async () => {
    const fake = new FakeClient();
    addAccount(fake, "user-2", "GMAIL");

    await connector(fake).purgeUserConnectedAccounts("user-1");

    expect(fake.providerRevokes).toEqual([]);
    expect(fake.deletedAccountIds).toEqual([]);
    expect(fake.accounts).toHaveLength(1);
  });
});
