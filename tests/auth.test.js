const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

async function startApp(principal, apiStatus = 200, sessionStatus = 200) {
  const elements = new Map();
  const calls = [];
  const context = vm.createContext({
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) {
          elements.set(selector, {
            hidden: false,
            textContent: "",
            lastElementChild: { textContent: "" },
            replaceChildren() { this.innerHTML = ""; },
            addEventListener(event, callback) { this[event] = callback; }
          });
        }
        return elements.get(selector);
      }
    },
    async fetch(url) {
      calls.push(url);
      const status = url === "/.auth/me" ? sessionStatus : apiStatus;
      return {
        status,
        ok: status === 200,
        async json() {
          return url === "/.auth/me" ? { clientPrincipal: principal } : [];
        }
      };
    }
  });
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, calls };
}

test("anonymous users are prompted to sign in without querying SQL", async () => {
  const { elements, calls } = await startApp(null);
  assert.deepEqual(calls, ["/.auth/me"]);
  assert.equal(elements.get("#data-panel").hidden, true);
  assert.equal(elements.get("#login-link").hidden, false);
});

test("signed-in users without members role cannot load data", async () => {
  const { elements, calls } = await startApp({
    identityProvider: "aad", userDetails: "member@example.com",
    userRoles: ["anonymous", "authenticated"]
  });
  assert.deepEqual(calls, ["/.auth/me"]);
  assert.match(elements.get("#auth-message").textContent, /members/);
  assert.equal(elements.get("#logout-link").hidden, false);
});

test("invited Entra members load data", async () => {
  const { elements, calls } = await startApp({
    identityProvider: "aad", userRoles: ["members"]
  });
  assert.deepEqual(calls, ["/.auth/me", "/api/users"]);
  assert.equal(elements.get("#data-panel").hidden, false);
  assert.equal(elements.get("#auth-panel").hidden, true);
});

test("other identity providers cannot load data in the UI", async () => {
  const { calls } = await startApp({
    identityProvider: "github", userRoles: ["members"]
  });
  assert.deepEqual(calls, ["/.auth/me"]);
});

for (const status of [401, 403]) {
  test(`API ${status} clears protected data and prompts reauthentication`, async () => {
    const { elements } = await startApp({
      identityProvider: "aad", userRoles: ["members"]
    }, status);
    assert.equal(elements.get("#data-panel").hidden, true);
    assert.equal(elements.get("#users-body").innerHTML, "");
    assert.equal(elements.get("#auth-panel").hidden, false);
    assert.equal(elements.get("#login-link").hidden, false);
  });
}

test("session lookup failure is visible and never queries SQL", async () => {
  const { elements, calls } = await startApp(null, 200, 500);
  assert.deepEqual(calls, ["/.auth/me"]);
  assert.match(elements.get("#auth-message").textContent, /HTTP 500/);
  assert.equal(elements.get("#data-panel").hidden, true);
});

test("deployed route configuration requires members for every API method", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "staticwebapp.config.json"), "utf8"));
  const api = config.routes.find((route) => route.route === "/api/*");
  assert.deepEqual(api.allowedRoles, ["members"]);
  assert.equal(api.methods, undefined);
  assert.equal(config.routes.find((route) => route.route === "/.auth/login/github").statusCode, 404);
  assert.equal(config.responseOverrides?.["401"], undefined);
});
