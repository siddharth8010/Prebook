const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');

const source = fs.readFileSync(join(__dirname, 'app.js'), 'utf8');

function makeBackend({ failWrites = false } = {}) {
  const documents = {};
  let queue = Promise.resolve();
  const snapshot = name => {
    const value = documents[name];
    return { exists: value !== undefined, data: () => value, metadata: { fromCache: false } };
  };
  return {
    documents,
    firestore: {
      collection: () => ({ doc: name => ({
        name,
        onSnapshot(onValue) { onValue(snapshot(name)); },
        async set(value) {
          if (failWrites) throw new Error('permission-denied');
          documents[name] = structuredClone(value);
        },
      }) }),
      runTransaction(callback) {
        const result = queue.then(async () => {
          const changes = [];
          const transaction = {
            get: async ref => snapshot(ref.name),
            set: (ref, value) => changes.push([ref.name, value]),
          };
          const value = await callback(transaction);
          if (failWrites) throw new Error('permission-denied');
          for (const [name, update] of changes) documents[name] = structuredClone(update);
          return value;
        });
        queue = result.catch(() => {});
        return result;
      },
    },
  };
}

function openClient(backend, { sdkAvailable = true, delaySnapshot = false, authEmail = 'siddharthsuresh57@gmail.com' } = {}) {
  let ready;
  let initialized = 0;
  const pendingSnapshots = [];
  const firestore = {
    ...backend.firestore,
    collection: () => ({ doc: name => ({
      ...backend.firestore.collection().doc(name),
      onSnapshot(onValue, onError) {
        const start = () => backend.firestore.collection().doc(name).onSnapshot(onValue, onError);
        if (delaySnapshot) pendingSnapshots.push(start);
        else start();
      },
    }) }),
  };
  const authUser = { email: authEmail, emailVerified: true, providerData: [{ providerId: 'google.com' }] };
  const auth = {
    currentUser: authUser,
    onAuthStateChanged(callback) { callback(authUser); },
    async signInWithPopup() { this.currentUser = authUser; return { user: authUser }; },
    async signOut() { this.currentUser = null; },
  };
  const firebaseAuth = () => auth;
  firebaseAuth.GoogleAuthProvider = class { setCustomParameters() {} };
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
      firestore: () => firestore,
      auth: firebaseAuth,
    } : undefined,
  });
  vm.runInContext(source, context);
  vm.runInContext('initParticles = () => {}; enterWorkspace = role => { currentUser = role; startFirestoreListeners(); }; leaveWorkspace = () => { currentUser = null; stopFirestoreListeners(); }; renderCalendar = () => {}; renderUpcoming = () => {}; renderStats = () => {}; showToast = () => {}', context);
  ready();
  return {
    initialized: () => initialized,
    load: () => pendingSnapshots.splice(0).forEach(start => start()),
    bookings: () => vm.runInContext('getBookings()', context),
    settings: () => vm.runInContext('getSettings()', context),
    add: (date, booking) => context.createBooking(date, booking),
    remove: (date, id, user) => context.removeBooking(date, id, user),
    saveSettings: settings => context.saveSettingsData(settings),
    roleFor: user => context.roleForFirebaseUser(user),
    login: role => context.login(role),
    activeUser: () => vm.runInContext('currentUser', context),
  };
}

test('only the two verified Google account emails map to calendar identities', () => {
  const client = openClient(makeBackend());
  const google = [{ providerId: 'google.com' }];
  assert.equal(client.roleFor({ email: 'diljith256@gmail.com', emailVerified: true, providerData: google }), 'diljith');
  assert.equal(client.roleFor({ email: 'outsider@example.com', emailVerified: true, providerData: google }), null);
  assert.equal(client.roleFor({ email: 'siddharthsuresh57@gmail.com', emailVerified: false, providerData: google }), null);
  assert.equal(client.roleFor({ email: 'siddharthsuresh57@gmail.com', emailVerified: true, providerData: [{ providerId: 'password' }] }), null);
});

test('the wrong Google account cannot enter the other calendar', async () => {
  const client = openClient(makeBackend());
  await client.login('diljith');
  assert.equal(client.activeUser(), null);
});

test('bookings persist across browser sessions', async () => {
  const backend = makeBackend();
  const first = openClient(backend);
  await first.add('2026-09-27', { id: 'b-1', user: 'siddharth', eventName: 'Wedding' });
  const second = openClient(backend);
  assert.equal(first.initialized(), 1);
  assert.equal(second.bookings()['2026-09-27'][0].eventName, 'Wedding');
});

test('stale clients adding and deleting bookings preserve the other person’s data', async () => {
  const backend = makeBackend();
  const siddharth = openClient(backend);
  const diljith = openClient(backend);
  await Promise.all([
    siddharth.add('2026-09-28', { id: 'sid-1', user: 'siddharth', eventName: 'Wedding' }),
    diljith.add('2026-09-28', { id: 'dil-1', user: 'diljith', eventName: 'Portraits' }),
  ]);
  assert.equal(backend.documents.bookings.data['2026-09-28'].length, 2);
  await siddharth.remove('2026-09-28', 'sid-1', 'siddharth');
  assert.equal(backend.documents.bookings.data['2026-09-28'][0].id, 'dil-1');
});

test('writes wait for the initial server snapshot and fail if Firebase is unavailable', async () => {
  const backend = makeBackend();
  const loading = openClient(backend, { delaySnapshot: true });
  const booking = { id: 'b-2', user: 'siddharth', eventName: 'Portraits' };
  await assert.rejects(loading.add('2026-09-27', booking));
  assert.equal(backend.documents.bookings, undefined);
  loading.load();
  await loading.add('2026-09-27', booking);
  const offline = openClient(backend, { sdkAvailable: false });
  await assert.rejects(offline.add('2026-09-27', booking));
});

test('rejected booking writes do not appear as saved', async () => {
  const backend = makeBackend({ failWrites: true });
  const client = openClient(backend);
  await assert.rejects(client.add('2026-09-27', {
    id: 'b-3', user: 'siddharth', eventName: 'Event',
  }));
  assert.equal(client.bookings()['2026-09-27'], undefined);
  assert.equal(backend.documents.bookings, undefined);
});

test('failed settings writes leave the cached settings unchanged', async () => {
  const backend = makeBackend({ failWrites: true });
  backend.documents.settings = { data: { gear: ['Lens'] } };
  const client = openClient(backend);
  await assert.rejects(client.saveSettings({ gear: ['Lens', 'Tripod'] }));
  assert.deepEqual(Array.from(client.settings().gear), ['Lens']);
  assert.deepEqual(backend.documents.settings.data.gear, ['Lens']);
});
