const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');

function openClient(store, { sdkAvailable = true, failWrites = false } = {}) {
  let ready;
  let initialized = 0;
  const doc = name => ({
    onSnapshot(onValue) {
      const value = store[name];
      onValue({ exists: value !== undefined, data: () => value });
    },
    async set(value) {
      if (failWrites) throw new Error('permission-denied');
      store[name] = value;
    },
  });
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    setTimeout,
    document: {
      addEventListener(name, callback) {
        if (name === 'DOMContentLoaded') ready = callback;
      },
      querySelectorAll: () => [],
    },
    firebase: sdkAvailable ? {
      initializeApp() { initialized += 1; },
      firestore() { return { collection: () => ({ doc }) }; },
    } : undefined,
  });
  vm.runInContext(source, context);
  vm.runInContext('initParticles = () => {}; tryRestoreSession = () => {}', context);
  ready();
  return {
    initialized: () => initialized,
    bookings: () => vm.runInContext('getBookings()', context),
    save: bookings => context.saveBookings(bookings),
  };
}

test('a booking survives a fresh browser session through Firestore', async () => {
  const store = {};
  const first = openClient(store);
  const booking = { id: 'b-1', user: 'siddharth', eventName: 'Wedding' };
  await first.save({ '2026-09-27': [booking] });

  const second = openClient(store);
  assert.equal(first.initialized(), 1);
  assert.equal(second.initialized(), 1);
  assert.equal(second.bookings()['2026-09-27'][0].eventName, 'Wedding');
});

test('a booking write fails clearly when Firebase is unavailable or rejects it', async () => {
  const booking = { '2026-09-27': [{ id: 'b-2', eventName: 'Portraits' }] };
  for (const options of [{ sdkAvailable: false }, { failWrites: true }]) {
    const store = {};
    const client = openClient(store, options);
    await assert.rejects(client.save(booking));
    assert.deepEqual(Object.keys(client.bookings()), []);
    assert.equal(store.bookings, undefined);
  }
});
