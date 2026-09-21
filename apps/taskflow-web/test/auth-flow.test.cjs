const { test } = require("node:test");
const assert = require("node:assert/strict");

test("an invitation survives login, signup, and an expired session", async () => {
  const { api, authPageHref, authReturnPath, loginHref } = await import("../lib/api.ts");
  const invite = "/invites/example-token";
  const login = loginHref(invite);
  assert.equal(new URL(login, "http://localhost:3000").searchParams.get("next"), invite);
  const signup = authPageHref("signup", invite);
  assert.equal(new URL(signup, "http://localhost:3000").searchParams.get("next"), invite);
  assert.equal(authReturnPath(new URL(signup, "http://localhost:3000").searchParams.get("next")), invite);
  assert.equal(authReturnPath("//example.com"), "/dashboard");
  assert.equal(authReturnPath("/\\example.com"), "/dashboard");

  const previousWindow = global.window;
  const previousSessionStorage = global.sessionStorage;
  const previousFetch = global.fetch;
  let cleared = false;
  global.window = { location: { pathname: invite, search: "", href: invite } };
  global.sessionStorage = {
    getItem: () => "expired-token",
    removeItem: () => { cleared = true; },
  };
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ message: "Please log in again." }),
  });
  try {
    await assert.rejects(api("/api/workspaces"), /Please log in again/);
    assert.equal(cleared, true);
    assert.equal(
      new URL(global.window.location.href, "http://localhost:3000").searchParams.get("next"),
      invite,
    );
  } finally {
    global.window = previousWindow;
    global.sessionStorage = previousSessionStorage;
    global.fetch = previousFetch;
  }
});
