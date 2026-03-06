const test = require("node:test");
const assert = require("node:assert/strict");

const ticketFeature = require("../src/features/Ticket/ticket");

function createDb(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key) {
      return map.get(String(key));
    },
    async set(key, value) {
      map.set(String(key), value);
      return value;
    },
    _map: map,
  };
}

test("reserveNextTicketNumber increments sequentially", async () => {
  const db = createDb();
  const gid = "100000000000000001";

  const first = await ticketFeature.__private.reserveNextTicketNumber(db, gid);
  const second = await ticketFeature.__private.reserveNextTicketNumber(db, gid);

  assert.equal(first, 1);
  assert.equal(second, 2);
});

test("reserveNextTicketNumber stays unique under concurrency", async () => {
  const db = createDb();
  const gid = "100000000000000002";

  const values = await Promise.all([
    ticketFeature.__private.reserveNextTicketNumber(db, gid),
    ticketFeature.__private.reserveNextTicketNumber(db, gid),
    ticketFeature.__private.reserveNextTicketNumber(db, gid),
    ticketFeature.__private.reserveNextTicketNumber(db, gid),
  ]);

  const sorted = [...values].sort((a, b) => a - b);
  assert.deepEqual(sorted, [1, 2, 3, 4]);
});
