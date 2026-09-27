'use strict';

// ╔══════════════════════════════════════════╗
// ║  CONFIGURATION                           ║
// ╚══════════════════════════════════════════╝

const USERS = {
  siddharth: { id: 'siddharth', name: 'Siddharth', color: '#818cf8', partner: 'diljith',   phone: '919947676051' },
  diljith:   { id: 'diljith',   name: 'Diljith',   color: '#22d3ee', partner: 'siddharth', phone: '918590177028' },
};

const DEFAULT_GEAR = [
  'Sony A7 IV Body', 'Canon R5 Body', '50mm f/1.4 Prime',
  '85mm f/1.8 Portrait', '24-70mm f/2.8 Zoom', 'DJI Mini 4 Pro Drone',
  'Godox AD200 Flash', 'Tripod / Monopod', 'LED Light Panel',
  '128GB Memory Cards', 'Laptop + Hard Drive', 'Reflector / Diffuser',
];

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ╔══════════════════════════════════════════╗
// ║  STATE                                   ║
// ╚══════════════════════════════════════════╝

let currentUser  = null;
let currentMonth = new Date().getMonth();
let currentYear  = new Date().getFullYear();
let selectedDate = null;

// Local cache
let bookingsCache = {};
let settingsCache = {};
let db = null;
let firebaseReady = false;

// ╔══════════════════════════════════════════╗
// ║  FIREBASE CONFIG                         ║
// ╚══════════════════════════════════════════╝

const firebaseConfig = {
  apiKey: "AIzaSyBzx1RtnNjdDpiiX7pX3u6Pv9Zu1EXm0oU",
  authDomain: "prebook-5b650.firebaseapp.com",
  projectId: "prebook-5b650",
  storageBucket: "prebook-5b650.firebasestorage.app",
  messagingSenderId: "455641228821",
  appId: "1:455641228821:web:8b50c24f63f9351ec8d01c",
  measurementId: "G-3SKT3TPWZN"
};

// ╔══════════════════════════════════════════╗
// ║  STORAGE                                 ║
// ╚══════════════════════════════════════════╝

function getBookings() {
  return bookingsCache || {};
}

function getSettings() {
  return settingsCache || {};
}

function getGearList() {
  return Array.isArray(settingsCache.gear) ? settingsCache.gear : [...DEFAULT_GEAR];
}

function getPartnerPhone() {
  if (!currentUser) return '';
  const partner = USERS[currentUser].partner;
  return USERS[partner].phone;
}

async function saveBookings(bookings) {
  bookingsCache = bookings || {};
  if (!firebaseReady || !db) {
    console.warn('Firebase not ready – booking saved only locally');
    return;
  }
  try {
    await db.collection('data').doc('bookings').set({ data: bookingsCache });
  } catch (err) {
    console.error('Failed to save bookings:', err);
    showToast('Failed to sync bookings. Check internet.', 'error');
  }
}

async function saveSettingsData(settings) {
  settingsCache = settings || {};
  if (!firebaseReady || !db) return;
  try {
    await db.collection('data').doc('settings').set({ data: settingsCache });
  } catch (err) {
    console.error('Failed to save settings:', err);
    showToast('Failed to sync settings.', 'error');
  }
}

function startFirestoreListeners() {
  if (!db) return;

  db.collection('data').doc('bookings').onSnapshot(
    (snap) => {
      if (snap.exists) {
        bookingsCache = snap.data().data || {};
      } else {
        bookingsCache = {};
      }
      if (currentUser) {
        renderCalendar();
        renderUpcoming();
        renderStats();
      }
    },
    (err) => {
      console.error('Bookings listener error:', err);
    }
  );

  db.collection('data').doc('settings').onSnapshot(
    (snap) => {
      if (snap.exists) {
        settingsCache = snap.data().data || {};
      } else {
        settingsCache = {};
      }
    },
    (err) => {
      console.error('Settings listener error:', err);
    }
  );
}

function initFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.error('Firebase SDK not loaded');
      return;
    }
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    firebaseReady = true;
    startFirestoreListeners();
    console.log('Firebase connected successfully');
  } catch (err) {
    console.error('Firebase init failed:', err);
    firebaseReady = false;
  }
}
// ╔══════════════════════════════════════════╗
// ║  AUTHENTICATION                          ║
// ╚══════════════════════════════════════════╝

function login(userId) {
  currentUser = userId;
  localStorage.setItem('freelens_session', userId);

  const user = USERS[userId];
  document.getElementById('header-user-name').textContent = user.name;

  const badge = document.getElementById('header-user-badge');
  badge.style.borderColor = user.color + '55';

  const dot = badge.querySelector('.live-dot');
  if (dot) {
    dot.style.background = user.color;
    dot.style.boxShadow  = `0 0 8px ${user.color}`;
  }

  // Optional legend labels (only if elements exist)
  const myLegend = document.getElementById('my-legend-label');
  const partnerLegend = document.getElementById('partner-legend-label');
  if (myLegend) myLegend.textContent = `${user.name}'s Booking`;
  if (partnerLegend) partnerLegend.textContent = `${USERS[user.partner].name}'s (Blocked 🔴)`;

  switchScreen('login-screen', 'app-screen');
  renderCalendar();
  renderUpcoming();
  renderStats();
}

function logout() {
  currentUser = null;
  localStorage.removeItem('freelens_session');
  switchScreen('app-screen', 'login-screen');
}

function tryRestoreSession() {
  const saved = localStorage.getItem('freelens_session');
  if (saved && USERS[saved]) login(saved);
}

// ╔══════════════════════════════════════════╗
// ║  SCREEN TRANSITIONS                      ║
// ╚══════════════════════════════════════════╝

function switchScreen(fromId, toId) {
  document.getElementById(fromId).classList.remove('active');
  setTimeout(() => document.getElementById(toId).classList.add('active'), 50);
}

// ╔══════════════════════════════════════════╗
// ║  CALENDAR                                ║
// ╚══════════════════════════════════════════╝

function renderCalendar() {
  if (!currentUser) return;

  document.getElementById('month-title').textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  const grid     = document.getElementById('days-grid');
  const bookings = getBookings();
  const today    = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysCount = new Date(currentYear, currentMonth + 1, 0).getDate();
  const partner  = USERS[currentUser].partner;

  let html = '';
  for (let i = 0; i < firstDay; i++) html += `<div class="day-cell empty"></div>`;

  for (let d = 1; d <= daysCount; d++) {
    const dateStr    = toDateStr(currentYear, currentMonth, d);
    const dayB       = bookings[dateStr] || [];
    const hasMine    = dayB.some(b => b.user === currentUser);
    const hasPartner = dayB.some(b => b.user === partner);
    const isToday    = dateStr === todayStr;

    let cls = 'day-cell';
    if (isToday)               cls += ' today';
    if (hasMine && hasPartner) cls += ' both-booking';
    else if (hasMine)          cls += ' my-booking';
    else if (hasPartner)       cls += ' partner-booking';

    let dots = '';
    if (dayB.length > 0) {
      dots = '<div class="booking-dots">';
      dayB.forEach(b => {
        const dc = b.user === currentUser
          ? (currentUser === 'siddharth' ? 'dot-sid' : 'dot-dil')
          : 'dot-red';
        dots += `<div class="booking-dot ${dc}"></div>`;
      });
      dots += '</div>';
    }

    const blockedLabel = (hasPartner && !hasMine)
      ? `<span class="blocked-label">BLOCKED</span>` : '';

    const delay = ((firstDay + d - 1) * 15) + 'ms';

    html += `
      <div class="${cls}"
           onclick="handleDayClick('${dateStr}')"
           title="${formatDateLong(currentYear, currentMonth, d)}"
           style="animation-delay:${delay}"
           data-date="${dateStr}">
        <span class="day-number">${d}</span>
        ${dots}
        ${blockedLabel}
      </div>`;
  }

  grid.innerHTML = html;
}

function prevMonth() {
  if (--currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderCalendar(); renderUpcoming(); renderStats();
}
function nextMonth() {
  if (++currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar(); renderUpcoming(); renderStats();
}
function goToToday() {
  const n = new Date();
  currentMonth = n.getMonth(); currentYear = n.getFullYear();
  renderCalendar(); renderUpcoming(); renderStats();
}

// ╔══════════════════════════════════════════╗
// ║  UPCOMING & STATS                        ║
// ╚══════════════════════════════════════════╝

function renderUpcoming() {
  const bookings = getBookings();
  const today    = new Date(); today.setHours(0,0,0,0);

  let all = [];
  for (const [dateStr, list] of Object.entries(bookings)) {
    const d = new Date(dateStr + 'T00:00:00');
    if (d >= today) list.forEach(b => all.push({ ...b, dateStr, d }));
  }
  all.sort((a, b) => a.d - b.d);

  const container   = document.getElementById('upcoming-list');
  const partnerName = USERS[USERS[currentUser].partner].name;

  if (all.length === 0) {
    container.innerHTML = '<p class="empty-state">No upcoming bookings yet.<br/>Click a date to add one!</p>';
    return;
  }

  container.innerHTML = all.slice(0, 10).map(item => {
    const isMe       = item.user === currentUser;
    const ownerLabel = isMe ? USERS[currentUser].name + ' (You)' : partnerName;
    const cls        = isMe ? 'mine' : 'theirs';
    const dateLabel  = formatDateShort(item.dateStr);
    const timeStr    = formatTimeRange(item.startTime, item.endTime);

    return `
      <div class="upcoming-item ${cls}" onclick="handleDayClick('${item.dateStr}')">
        <div class="upcoming-date">${dateLabel}${timeStr ? ' · ' + timeStr : ''}</div>
        <div class="upcoming-event-name">${escHtml(item.eventName || 'Untitled Event')}</div>
        <div class="upcoming-owner">${ownerLabel}${item.clientName ? ' · ' + escHtml(item.clientName) : ''}</div>
      </div>`;
  }).join('');
}

function renderStats() {
  const bookings    = getBookings();
  const partner     = USERS[currentUser].partner;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  let myCount = 0, partnerCount = 0, freeDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr    = toDateStr(currentYear, currentMonth, d);
    const list       = bookings[dateStr] || [];
    const hasMine    = list.some(b => b.user === currentUser);
    const hasPartner = list.some(b => b.user === partner);
    if (hasMine)    myCount++;
    if (hasPartner) partnerCount++;
    if (!hasMine && !hasPartner) freeDays++;
  }

  document.getElementById('stat-my').textContent      = myCount;
  document.getElementById('stat-partner').textContent = partnerCount;
  document.getElementById('stat-free').textContent    = freeDays;
}

// ╔══════════════════════════════════════════╗
// ║  BOOKING MODAL                           ║
// ╚══════════════════════════════════════════╝

function handleDayClick(dateStr) {
  selectedDate = dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  document.getElementById('modal-date-heading').textContent = formatDateLong(y, m - 1, d);

  // Clear form
  document.getElementById('inp-event-name').value  = '';
  document.getElementById('inp-client-name').value = '';
  document.getElementById('inp-location').value    = '';
  document.getElementById('inp-start-time').value  = '';
  document.getElementById('inp-end-time').value    = '';

  // Partner-already-booked warning
  const bookings   = getBookings();
  const dayB       = bookings[dateStr] || [];
  const hasPartner = dayB.some(b => b.user === USERS[currentUser].partner);

  let tip = document.getElementById('booking-blocked-tip');
  if (!tip) {
    tip = document.createElement('p');
    tip.id = 'booking-blocked-tip';
    tip.style.cssText = 'color:#f87171;font-size:0.85rem;margin-bottom:10px;padding:10px 14px;background:rgba(248,113,113,0.08);border-radius:8px;border:1px solid rgba(248,113,113,0.2)';
    document.getElementById('new-booking-section').prepend(tip);
  }
  tip.style.display = hasPartner ? 'block' : 'none';
  if (hasPartner) {
    tip.textContent = '⚠️ ' + USERS[USERS[currentUser].partner].name + ' already has a booking on this date.';
  }

  populateGearChecklist();
  showExistingBookings(dateStr);
  openModal('booking-modal');
}

function showExistingBookings(dateStr) {
  const bookings  = getBookings();
  const list      = bookings[dateStr] || [];
  const section   = document.getElementById('existing-bookings-section');
  const container = document.getElementById('existing-bookings-list');
  const partner   = USERS[currentUser].partner;

  if (list.length === 0) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  container.innerHTML = list.map(b => {
    const isMe      = b.user === currentUser;
    const ownerTag  = isMe ? USERS[currentUser].name + ' (You)' : USERS[partner].name;
    const tagCls    = isMe ? 'mine' : 'theirs';
    const gearText  = (b.gear && b.gear.length > 0)
      ? b.gear.slice(0,3).join(', ') + (b.gear.length > 3 ? ` +${b.gear.length-3} more` : '')
      : 'No gear specified';
    const timeRange = formatTimeRange(b.startTime, b.endTime);

    return `
      <div class="existing-booking-card" id="ebc-${b.id}">
        <div class="ebc-left">
          <div class="ebc-owner-tag ${tagCls}">${escHtml(ownerTag)}</div>
          <div class="ebc-event-name">${escHtml(b.eventName || 'Untitled Event')}</div>
          <div class="ebc-meta">
            ${b.clientName ? '👤 ' + escHtml(b.clientName) + ' &nbsp;' : ''}
            ${b.location   ? '📍 ' + escHtml(b.location)   + ' &nbsp;' : ''}
            ${timeRange    ? '🕐 ' + escHtml(timeRange) : ''}
          </div>
          <div class="ebc-meta" style="margin-top:4px">🎒 ${escHtml(gearText)}</div>
        </div>
        ${isMe ? `<button class="ebc-delete" onclick="deleteBooking('${dateStr}','${b.id}')">🗑 Delete</button>` : ''}
      </div>`;
  }).join('');
}

function populateGearChecklist() {
  const gear = getGearList();
  document.getElementById('gear-checklist').innerHTML = gear.map((item, i) => `
    <label class="gear-chip" for="gear-${i}">
      <input type="checkbox" id="gear-${i}" value="${escAttr(item)}"
             onchange="this.closest('.gear-chip').classList.toggle('selected', this.checked)" />
      ${escHtml(item)}
    </label>`).join('');
}

function closeBookingModal() {
  closeModal('booking-modal');
  selectedDate = null;
}

async function saveBooking() {
  if (!selectedDate) return;
  const bookingDate = selectedDate;

  const eventName = document.getElementById('inp-event-name').value.trim();
  if (!eventName) {
    showToast('Please enter an event name!', 'error');
    document.getElementById('inp-event-name').focus();
    return;
  }

  const clientName = document.getElementById('inp-client-name').value.trim();
  const location   = document.getElementById('inp-location').value.trim();
  const startTime  = document.getElementById('inp-start-time').value;
  const endTime    = document.getElementById('inp-end-time').value;
  const gear       = [...document.querySelectorAll('#gear-checklist input:checked')]
                       .map(el => el.value);

  const booking = {
    id: generateId(), user: currentUser,
    eventName, clientName, location,
    startTime, endTime, gear,
    createdAt: new Date().toISOString(),
  };

  const bookings = getBookings();
  if (!Array.isArray(bookings[selectedDate])) bookings[selectedDate] = [];
  bookings[selectedDate].push(booking);

  await saveBookings(bookings);

  renderCalendar();
  renderUpcoming();
  renderStats();
  closeBookingModal();
  showToast('✅ Booking saved!', 'success');

  // ── Build WhatsApp message ──
  const partner  = USERS[USERS[currentUser].partner];
  const myName   = USERS[currentUser].name;
  const dateStr  = formatDateShort(bookingDate);
  const gearStr  = gear.length > 0 ? gear.join(', ') : 'None';
  const timeStr  = formatTimeRange(startTime, endTime);

  const msg = [
    `📸 *Prebook Booking Alert*`,
    ``,
    `Hey ${partner.name}! 👋`,
    `*${myName}* just booked *${dateStr}* — this date is 🔴 blocked on your calendar.`,
    ``,
    `🎯 *Event:* ${eventName}`,
    clientName ? `👤 *Client:* ${clientName}` : null,
    location   ? `📍 *Location:* ${location}`  : null,
    timeStr    ? `🕐 *Time:* ${timeStr}` : null,
    `🎒 *Gear:* ${gearStr}`,
    ``,
    `Open Prebook to see the updated calendar.`,
  ].filter(Boolean).join('\n');

  // ── Open WhatsApp for the other photographer ──
  const phone = getPartnerPhone();

  if (phone) {
    window.location.assign(buildWaUrl(phone, msg));
    return;
  }

  document.getElementById('wa-confirm-msg').textContent =
    `Enter ${partner.name}'s number to send a WhatsApp notification.`;
  document.getElementById('wa-phone-label').textContent =
    `${partner.name}'s WhatsApp Number`;
  document.getElementById('inp-wa-phone').value = '';
  document.getElementById('wa-phone-section').style.display = 'block';
  window._pendingWaMsg = msg;

  openModal('wa-confirm');
}

async function deleteBooking(dateStr, bookingId) {
  if (!confirm('Delete this booking?')) return;

  const bookings = getBookings();
  if (bookings[dateStr]) {
    bookings[dateStr] = bookings[dateStr].filter(b => b.id !== bookingId);
    if (bookings[dateStr].length === 0) delete bookings[dateStr];
  }

  await saveBookings(bookings);

  renderCalendar();
  renderUpcoming();
  renderStats();
  showExistingBookings(dateStr);

  if (!(bookings[dateStr] && bookings[dateStr].length > 0)) {
    document.getElementById('existing-bookings-section').style.display = 'none';
  }

  showToast('🗑 Booking deleted.', '');
}

// ╔══════════════════════════════════════════╗
// ║  WHATSAPP                                ║
// ╚══════════════════════════════════════════╝

function buildWaUrl(phone, msg) {
  const clean = String(phone).replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
}

async function doOpenWhatsApp() {
  const raw = document.getElementById('inp-wa-phone').value.replace(/\D/g, '');
  if (!raw || raw.length < 10) {
    showToast('⚠️ Enter partner\'s number with country code first!', 'error');
    document.getElementById('inp-wa-phone').focus();
    return;
  }

  const partnerKey = USERS[currentUser].partner;
  const s = getSettings();
  s[partnerKey + '_phone'] = raw;
  await saveSettingsData(s);

  // Navigate in the same tab so popup blockers cannot prevent WhatsApp opening.
  window.location.assign(buildWaUrl(raw, window._pendingWaMsg || ''));
  closeWaConfirm();
}

function closeWaConfirm() {
  closeModal('wa-confirm');
  window._pendingWaMsg = '';
}

// ╔══════════════════════════════════════════╗
// ║  SETTINGS                                ║
// ╚══════════════════════════════════════════╝

function openSettings() {
  renderGearSettingsList();
  openModal('settings-modal');
}
function closeSettings() { closeModal('settings-modal'); }

function saveSettings() {
  closeSettings();
}

function renderGearSettingsList() {
  const gear = getGearList();
  document.getElementById('gear-settings-list').innerHTML = gear.map((item, i) => `
    <div class="gear-settings-item">
      <span class="gear-item-name">${escHtml(item)}</span>
      <button class="gear-delete-btn" onclick="removeGearItem(${i})" title="Remove">✕</button>
    </div>`).join('');
}

async function addGearItem() {
  const inp = document.getElementById('inp-new-gear');
  const val = inp.value.trim();
  if (!val) { inp.focus(); return; }
  const s    = getSettings();
  const gear = Array.isArray(s.gear) ? s.gear : [...DEFAULT_GEAR];
  gear.push(val);
  s.gear = gear;
  await saveSettingsData(s);
  inp.value = '';
  renderGearSettingsList();
  showToast('✅ Gear added!', 'success');
}

async function removeGearItem(index) {
  const s    = getSettings();
  const gear = Array.isArray(s.gear) ? s.gear : [...DEFAULT_GEAR];
  gear.splice(index, 1);
  s.gear = gear;
  await saveSettingsData(s);
  renderGearSettingsList();
}

// ╔══════════════════════════════════════════╗
// ║  MODAL HELPERS                           ║
// ╚══════════════════════════════════════════╝

function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
function handleOverlayClick(event, modalId) {
  if (event.target === document.getElementById(modalId)) {
    closeModal(modalId);
    if (modalId === 'booking-modal')  selectedDate = null;
    if (modalId === 'wa-confirm')     window._pendingWaMsg = '';
  }
}

// ╔══════════════════════════════════════════╗
// ║  TOAST                                   ║
// ╚══════════════════════════════════════════╝

let toastTimer = null;
function showToast(msg, type) {
  const toast     = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = 'toast show' + (type ? ' ' + type : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ╔══════════════════════════════════════════╗
// ║  PARTICLE SYSTEM                         ║
// ╚══════════════════════════════════════════╝

function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  const ctx    = canvas.getContext('2d');
  let w, h, particles;
  const COLORS = ['rgba(129,140,248,', 'rgba(34,211,238,', 'rgba(168,85,247,'];

  function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
  function create() {
    const count = Math.min(70, Math.floor(window.innerWidth / 22));
    particles = Array.from({ length: count }, () => ({
      x:  Math.random() * w, y:  Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r:  Math.random() * 1.4 + 0.4,
      a:  Math.random() * 0.45 + 0.1,
      c:  COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c + p.a + ')';
      ctx.fill();
    });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 110) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(129,140,248,${0.07*(1-dist/110)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  resize(); create(); draw();
  window.addEventListener('resize', () => { resize(); create(); });
}

// ╔══════════════════════════════════════════╗
// ║  KEYBOARD SHORTCUTS                      ║
// ╚══════════════════════════════════════════╝

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal('booking-modal'); closeModal('settings-modal'); closeModal('wa-confirm');
    selectedDate = null; window._pendingWaMsg = '';
    document.body.style.overflow = '';
  }
  if (currentUser) {
    if (e.key === 'ArrowLeft')  prevMonth();
    if (e.key === 'ArrowRight') nextMonth();
  }
});

// ╔══════════════════════════════════════════╗
// ║  UTILITIES                               ║
// ╚══════════════════════════════════════════╝

function toDateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function formatDateLong(y, m, d) {
  return `${MONTH_NAMES[m]} ${d}, ${y}`;
}
function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  const mon = MONTH_NAMES[m-1].slice(0,3);
  return y === now.getFullYear() ? `${mon} ${d}` : `${mon} ${d}, ${y}`;
}
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h%12||12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function formatTimeRange(start, end) {
  if (!start && !end) return '';
  if (start && end)   return `${formatTime(start)} – ${formatTime(end)}`;
  if (start)          return `From ${formatTime(start)}`;
  return `Until ${formatTime(end)}`;
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ╔══════════════════════════════════════════╗
// ║  INIT                                    ║
// ╚══════════════════════════════════════════╝

document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  startFirestoreListeners();   // start real-time sync
  tryRestoreSession();

  document.querySelectorAll('.user-card').forEach(card => {
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') card.click();
    });
  });
});