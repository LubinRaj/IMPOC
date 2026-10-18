import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalize } from "@/server/collectors/native";
import { collectLive, sourceMode } from "@/server/collectors/live";
import type { Provider } from "@/lib/contracts";
const scopeId = "11111111-1111-4111-8111-111111111111";
vi.mock("@aws-sdk/client-ec2", () => ({
  EC2Client: class {
    destroy() {}
  },
  paginateDescribeInstances: async function* () {
    yield {
      Reservations: [
        {
          Instances: [
            {
              InstanceId: "i-live",
              State: { Name: "running" },
              PrivateIpAddress: "10.0.0.4",
              Tags: [{ Key: "Name", Value: "aws-live" }],
            },
          ],
        },
      ],
    };
  },
}));
vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class {
    async getToken() {
      return { token: "mock" };
    }
  },
}));
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return {
        request: async () => ({
          data: {
            items: {
              "zones/a": {
                instances: [
                  {
                    id: "123",
                    name: "gcp-live",
                    status: "RUNNING",
                    zone: "zones/a",
                    networkInterfaces: [{ networkIP: "10.0.0.5" }],
                  },
                ],
              },
            },
          },
        }),
      };
    }
  },
}));
function scope(provider: Provider) {
  return { id: scopeId, provider, environment: "test" };
}
beforeEach(() => {
  process.env.SOURCE_MODE = "live";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.LIVE_SCOPE_CONFIG_JSON;
  delete process.env.SOURCE_MODE;
  delete process.env.VMWARE_USERNAME;
  delete process.env.VMWARE_PASSWORD;
  delete process.env.PROXMOX_TOKEN_ID;
  delete process.env.PROXMOX_TOKEN_SECRET;
});
describe("read-only live collectors", () => {
  it("defaults to simulation and rejects invalid mode", () => {
    delete process.env.SOURCE_MODE;
    expect(sourceMode()).toBe("simulation");
    process.env.SOURCE_MODE = "wrong";
    expect(() => sourceMode()).toThrow();
  });
  it("rejects missing live scope config instead of returning empty inventory", async () => {
    await expect(collectLive(scope("aws"))).rejects.toThrow(
      "No live configuration",
    );
  });
  it("maps paginated AWS SDK results through native normalization", async () => {
    process.env.LIVE_SCOPE_CONFIG_JSON = JSON.stringify({
      [scopeId]: { region: "us-east-1" },
    });
    const rows = await collectLive(scope("aws"));
    expect(rows).toHaveLength(1);
    expect(normalize("aws", scopeId, rows[0].nativePayload)).toMatchObject({
      externalId: "i-live",
      hostname: "aws-live",
      powerState: "running",
    });
  });
  it("maps Azure continuation pages", async () => {
    process.env.LIVE_SCOPE_CONFIG_JSON = JSON.stringify({
      [scopeId]: { subscriptionId: "subscription" },
    });
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () =>
          ++calls === 1
            ? {
                value: [{ id: "/vm/1", name: "first", location: "eastus" }],
                nextLink: "https://management.azure.com/next",
              }
            : { value: [{ id: "/vm/2", name: "second", location: "eastus" }] },
      })),
    );
    const rows = await collectLive(scope("azure"));
    expect(rows.map((row) => row.externalId)).toEqual(["/vm/1", "/vm/2"]);
    expect(calls).toBe(2);
  });
  it("maps GCP aggregated results", async () => {
    process.env.LIVE_SCOPE_CONFIG_JSON = JSON.stringify({
      [scopeId]: { projectId: "project" },
    });
    const rows = await collectLive(scope("gcp"));
    expect(normalize("gcp", scopeId, rows[0].nativePayload)).toMatchObject({
      externalId: "123",
      hostname: "gcp-live",
      powerState: "running",
    });
  });
  it("maps VMware REST listing without writing infrastructure", async () => {
    process.env.LIVE_SCOPE_CONFIG_JSON = JSON.stringify({
      [scopeId]: { url: "https://vcenter.example" },
    });
    process.env.VMWARE_USERNAME = "reader";
    process.env.VMWARE_PASSWORD = "test";
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init: RequestInit) => {
        methods.push(init.method || "GET");
        return {
          ok: true,
          json: async () =>
            init.method === "POST"
              ? "session"
              : [
                  {
                    vm: "vm-1",
                    name: "vmware-live",
                    power_state: "POWERED_ON",
                    cpu_count: 2,
                    memory_size_MiB: 2048,
                  },
                ],
        };
      }),
    );
    const rows = await collectLive(scope("vmware"));
    expect(rows[0].externalId).toBe("vm-1");
    expect(methods).toEqual(["POST", "GET", "DELETE"]);
  });
  it("maps Proxmox inventory and rejects API failure", async () => {
    process.env.LIVE_SCOPE_CONFIG_JSON = JSON.stringify({
      [scopeId]: { url: "https://pve.example:8006" },
    });
    process.env.PROXMOX_TOKEN_ID = "reader@pve!inventory";
    process.env.PROXMOX_TOKEN_SECRET = "test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              type: "qemu",
              vmid: 100,
              name: "pve-live",
              node: "pve1",
              status: "running",
              maxcpu: 2,
              maxmem: 2147483648,
              maxdisk: 32212254720,
            },
          ],
        }),
      })),
    );
    const rows = await collectLive(scope("proxmox"));
    expect(rows[0].externalId).toBe("qemu/100");
    expect(normalize("proxmox", scopeId, rows[0].nativePayload).memoryMB).toBe(
      2048,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    await expect(collectLive(scope("proxmox"))).rejects.toThrow("HTTP 503");
  });
});
