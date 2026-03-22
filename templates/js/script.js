
const pageTitles = { dashboard:'Dashboard', schedules:'Schedules', students:'Students', assessments:'Assessments', attendance:'Attendance', grades:'Grades', setup:'School Setup', settings:'Settings' };

function showPage(id, sidebarEl) {
document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
document.getElementById('page-' + id).classList.add('active');
document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
if (sidebarEl) sidebarEl.classList.add('active');
document.getElementById('topbar-title').textContent = pageTitles[id] || id;
// sync bottom nav
document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));
const bn = document.getElementById('bnav-' + id);
if (bn) bn.classList.add('active');
closeSidebar();
}

function bnavClick(id, bnavEl) {
let match = null;
document.querySelectorAll('.nav-item').forEach(item => {
    const oc = item.getAttribute('onclick') || '';
    if (oc.includes("'" + id + "'")) match = item;
});
showPage(id, match);
}

function openSidebar() {
document.getElementById('sidebar').classList.add('open');
document.getElementById('sidebar-overlay').classList.add('open');
}

function closeSidebar() {
document.getElementById('sidebar').classList.remove('open');
document.getElementById('sidebar-overlay').classList.remove('open');
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeModalOutside(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

function setAtt(btn, type) {
const group = btn.closest('.att-status');
group.querySelectorAll('.att-btn').forEach(b => {
    const m = b.getAttribute('onclick') && b.getAttribute('onclick').match(/setAtt\(this,'(\w)'\)/);
    if (m) b.className = 'att-btn ' + m[1];
});
btn.classList.add('active-' + type);
}

const gradeTabs = ['tab-prelim','tab-midterm','tab-prefinal','tab-final','tab-average'];
function switchTab(el, tabId) {
gradeTabs.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
const t = document.getElementById(tabId);
if (t) t.style.display = 'block';
el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
el.classList.add('active');
}
