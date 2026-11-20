import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  query: vi.fn<() => Promise<{ rows: { locked: boolean }[] }>>(),
  end: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/server/env", () => ({ env: { DATABASE_URL: "postgres://localhost/test" } }));
vi.mock("pg", () => ({
  default: {
    Client: class {
      on() {}
      connect = db.connect;
      query = db.query;
      end = db.end;
    },
  },
}));

const { withJobLock } = await import("./job-lock");

describe("withJobLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.connect.mockResolvedValue();
    db.end.mockResolvedValue();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("runs the job while holding the lock, then closes the connection", async () => {
    db.query.mockResolvedValue({ rows: [{ locked: true }] });
    const run = vi.fn(async () => {
      expect(db.end).not.toHaveBeenCalled();
    });
    await withJobLock("job", run);
    expect(run).toHaveBeenCalledOnce();
    expect(db.end).toHaveBeenCalledOnce();
  });

  it("skips the run when another process holds the lock", async () => {
    db.query.mockResolvedValue({ rows: [{ locked: false }] });
    const run = vi.fn(async () => {});
    await withJobLock("job", run);
    expect(run).not.toHaveBeenCalled();
    expect(db.end).toHaveBeenCalledOnce();
  });

  it("skips the run without throwing when the database is unreachable", async () => {
    db.connect.mockRejectedValue(new Error("ECONNREFUSED"));
    const run = vi.fn(async () => {});
    await expect(withJobLock("job", run)).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it("passes the job's own error on, and still releases the lock", async () => {
    db.query.mockResolvedValue({ rows: [{ locked: true }] });
    await expect(withJobLock("job", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(db.end).toHaveBeenCalledOnce();
  });
});
