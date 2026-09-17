// Use the deployed app's own API in production and localhost during development.
const BASE_URL = window.location.origin;

// State Variables
let currentDate = getTodayDateString();
let activeTab = 'rollcall';
let rollCallView = 'room'; // 'room' or 'list'
let studentsData = [];
let summaryData = {};
let debounceTimer = null;

// Initialize App on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('attendanceDate').value = currentDate;

  // Date change listener
  document.getElementById('attendanceDate').addEventListener('change', (e) => {
    currentDate = e.target.value;
    refreshAllData();
  });

  // Initial load
  refreshAllData();
});

// Helper: Today YYYY-MM-DD
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Debounce helper
function debounce(func, delay = 300) {
  return function (...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(this, args), delay);
  };
}

// Refresh all relevant tab data
function refreshAllData() {
  loadSummary();
  if (activeTab === 'rollcall') loadAttendance();
  else if (activeTab === 'absentees') loadAbsentees();
  else if (activeTab === 'students') loadStudentsDirectory();
  else if (activeTab === 'leaves') loadLeaves();
  else if (activeTab === 'reports') loadMonthlyReport();
}

// Tab Switching
function switchTab(tabName) {
  activeTab = tabName;

  // Update tab buttons style
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('border-emerald-600', 'text-emerald-600');
    btn.classList.add('border-transparent', 'text-slate-600');
  });

  const activeBtn = document.getElementById(`tabBtn-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.add('border-emerald-600', 'text-emerald-600');
    activeBtn.classList.remove('border-transparent', 'text-slate-600');
  }

  // Show selected content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });

  const targetContent = document.getElementById(`tab-${tabName}`);
  if (targetContent) {
    targetContent.classList.remove('hidden');
  }

  refreshAllData();
}

// Load Summary Stats
// Updated fetch calls to use BASE_URL
async function loadSummary() {
  try {
    const res = await fetch(`${BASE_URL}/api/attendance/summary?date=${currentDate}`);
    const data = await res.json();
    summaryData = data;

    document.getElementById('statTotal').innerText = data.totalStudents;
    document.getElementById('statPresent').innerText = data.present;
    document.getElementById('statAbsent').innerText = data.absent;
    document.getElementById('statLeaveLate').innerText = (data.leave + data.late);
    document.getElementById('statUnmarked').innerText = data.unmarked;

    const rate = data.completionRate || 0;
    document.getElementById('progressBar').style.width = `${rate}%`;
    document.getElementById('progressText').innerText = `${rate}%`;

    // Update absentee badge count
    const badge = document.getElementById('absenteeBadge');
    if (data.absent > 0) {
      badge.innerText = data.absent;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error fetching summary:', err);
  }
}

// ==================== ROLL CALL TAB ====================

function setRollCallView(mode) {
  rollCallView = mode;
  const roomBtn = document.getElementById('viewBtnRoom');
  const listBtn = document.getElementById('viewBtnList');

  if (mode === 'room') {
    roomBtn.className = 'px-2.5 py-1 text-xs font-semibold rounded-md bg-white text-slate-800 shadow-xs';
    listBtn.className = 'px-2.5 py-1 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900';
  } else {
    listBtn.className = 'px-2.5 py-1 text-xs font-semibold rounded-md bg-white text-slate-800 shadow-xs';
    roomBtn.className = 'px-2.5 py-1 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900';
  }

  renderRollCall();
}

async function loadAttendance() {
  const block = document.getElementById('filterBlock').value;
  const floor = document.getElementById('filterFloor').value;
  const search = document.getElementById('searchRollCall').value;
  const unmarkedOnly = document.getElementById('unmarkedOnly').checked;

  try {
    const url = `${BASE_URL}/api/attendance?date=${currentDate}&block=${encodeURIComponent(block)}&floor=${encodeURIComponent(floor)}&search=${encodeURIComponent(search)}&unmarkedOnly=${unmarkedOnly}`;
    const res = await fetch(url);
    const data = await res.json();

    studentsData = data.students || [];
    document.getElementById('filteredStudentCount').innerText = `${studentsData.length} students found`;

    renderRollCall();
  } catch (err) {
    console.error('Error loading attendance:', err);
  }
}

function renderRollCall() {
  const container = document.getElementById('rollCallContainer');
  container.innerHTML = '';

  if (studentsData.length === 0) {
    container.innerHTML = `
      <div class="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
        <i class="fa-solid fa-users-slash text-3xl text-slate-300 mb-2 block"></i>
        No students found matching your filter criteria.
      </div>
    `;
    return;
  }

  if (rollCallView === 'room') {
    renderByRooms(container);
  } else {
    renderAsList(container);
  }
}

// Group students by Block + Floor + Room
function renderByRooms(container) {
  const roomGroups = {};

  studentsData.forEach(student => {
    const key = `${student.block} - ${student.floor} - Room ${student.roomNo}`;
    if (!roomGroups[key]) {
      roomGroups[key] = {
        block: student.block,
        floor: student.floor,
        roomNo: student.roomNo,
        students: []
      };
    }
    roomGroups[key].students.push(student);
  });

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4';

  Object.keys(roomGroups).forEach(key => {
    const group = roomGroups[key];
    const roomCard = document.createElement('div');
    roomCard.className = 'bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden';

    // Check if all students in this room are marked present
    const allPresent = group.students.every(s => s.status === 'PRESENT');

    roomCard.innerHTML = `
      <div class="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
        <div>
          <span class="font-bold text-slate-800 text-sm"><i class="fa-solid fa-door-closed text-slate-500 mr-1.5"></i>Room ${group.roomNo}</span>
          <span class="text-xs text-slate-500 ml-2">(${group.block}, ${group.floor})</span>
        </div>
        <button onclick="markRoomPresent('${group.roomNo}', '${group.block}')" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center">
          <i class="fa-solid fa-check mr-1"></i> Mark Room Present (${group.students.length})
        </button>
      </div>
      <div class="p-3 divide-y divide-slate-100 space-y-3">
        ${group.students.map(s => renderStudentCardRow(s)).join('')}
      </div>
    `;

    grid.appendChild(roomCard);
  });

  container.appendChild(grid);
}

// Flat list view
function renderAsList(container) {
  const card = document.createElement('div');
  card.className = 'bg-white border border-slate-200 rounded-xl shadow-xs p-3 space-y-3 divide-y divide-slate-100';

  studentsData.forEach(student => {
    card.innerHTML += renderStudentCardRow(student);
  });

  container.appendChild(card);
}

// Render individual student row with status buttons
function renderStudentCardRow(s) {
  const status = s.status || null;

  return `
    <div class="pt-2 first:pt-0 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div>
        <div class="font-bold text-slate-800 text-sm">${s.name}</div>
        <div class="text-slate-500 text-[11px] flex items-center gap-2 mt-0.5">
          <span class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-mono">${s.rollNo}</span>
          <span><i class="fa-solid fa-door-closed text-slate-400 mr-0.5"></i>Room ${s.roomNo}</span>
          ${s.phone ? `<a href="tel:${s.phone}" class="text-emerald-600 hover:underline"><i class="fa-solid fa-phone text-[10px]"></i> ${s.phone}</a>` : ''}
          ${s.autoLeave ? `<span class="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-semibold"><i class="fa-solid fa-umbrella-beach mr-1"></i>Approved Leave</span>` : ''}
        </div>
      </div>

      <!-- Action Status Buttons -->
      <div class="flex items-center space-x-1">
        <button onclick="setStudentStatus(${s.id}, 'PRESENT')" 
          class="px-2.5 py-1.5 rounded-lg font-bold border transition-all flex items-center gap-1 ${status === 'PRESENT'
      ? 'bg-emerald-600 text-white border-emerald-600 btn-status-active shadow-md'
      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
    }">
          <i class="fa-solid fa-circle-check"></i>
          <span>Present</span>
        </button>

        <button onclick="setStudentStatus(${s.id}, 'ABSENT')" 
          class="px-2.5 py-1.5 rounded-lg font-bold border transition-all flex items-center gap-1 ${status === 'ABSENT'
      ? 'bg-rose-600 text-white border-rose-600 btn-status-active shadow-md'
      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
    }">
          <i class="fa-solid fa-circle-xmark"></i>
          <span>Absent</span>
        </button>

        <button onclick="setStudentStatus(${s.id}, 'LEAVE')" 
          class="px-2.5 py-1.5 rounded-lg font-bold border transition-all flex items-center gap-1 ${status === 'LEAVE'
      ? 'bg-amber-500 text-white border-amber-500 btn-status-active shadow-md'
      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
    }">
          <i class="fa-solid fa-plane-departure"></i>
          <span>Leave</span>
        </button>

        <button onclick="setStudentStatus(${s.id}, 'LATE')" 
          class="px-2.5 py-1.5 rounded-lg font-bold border transition-all flex items-center gap-1 ${status === 'LATE'
      ? 'bg-orange-500 text-white border-orange-500 btn-status-active shadow-md'
      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300'
    }">
          <i class="fa-solid fa-clock"></i>
          <span>Late</span>
        </button>
      </div>
    </div>
  `;
}

// Single student status update API
async function setStudentStatus(studentId, status) {
  try {
    const res = await fetch(`${BASE_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, date: currentDate, status })
    });

    if (res.ok) {
      // Optimistic state update in cache
      const student = studentsData.find(s => s.id === studentId);
      if (student) student.status = status;
      renderRollCall();
      loadSummary();
      showToast(`Marked ${status.toLowerCase()}`, 'success');
    }
  } catch (err) {
    console.error('Error updating status:', err);
    showToast('Failed to save status', 'error');
  }
}

// Bulk mark entire room present
async function markRoomPresent(roomNo, block) {
  try {
    const res = await fetch(`${BASE_URL}/api/attendance/bulk-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: currentDate, roomNo, block, status: 'PRESENT' })
    });

    if (res.ok) {
      showToast(`Marked all students in Room ${roomNo} Present`, 'success');
      loadAttendance();
      loadSummary();
    }
  } catch (err) {
    console.error('Error marking room present:', err);
  }
}

// Quick Mark All Unmarked Present
async function quickMarkAllPresent() {
  const block = document.getElementById('filterBlock').value;
  const floor = document.getElementById('filterFloor').value;

  const targetText = block || floor ? `${block} ${floor}` : 'ALL unmarked students';
  if (!confirm(`Are you sure you want to mark ${targetText} as PRESENT for ${currentDate}?`)) {
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/attendance/mark-all-unmarked-present`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: currentDate, block, floor })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`Marked ${data.count} unmarked students as Present`, 'success');
      loadAttendance();
      loadSummary();
    }
  } catch (err) {
    console.error('Error in quick mark all present:', err);
  }
}

// ==================== ABSENTEES TAB ====================

async function loadAbsentees() {
  try {
    const res = await fetch(`${BASE_URL}/api/attendance/absentees?date=${currentDate}`);
    const data = await res.json();
    const absentees = data.absentees || [];

    const container = document.getElementById('absenteeList');
    container.innerHTML = '';

    if (absentees.length === 0) {
      container.innerHTML = `
        <div class="col-span-full bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
          <i class="fa-solid fa-circle-check text-4xl text-emerald-500 mb-2 block"></i>
          Great news! No students marked absent or late for ${currentDate}.
        </div>
      `;
      return;
    }

    absentees.forEach(a => {
      const card = document.createElement('div');
      card.className = 'bg-white border border-rose-200 rounded-xl p-4 shadow-xs hover:shadow-md transition space-y-3';

      card.innerHTML = `
        <div class="flex items-start justify-between border-b pb-2">
          <div>
            <h3 class="font-bold text-slate-900 text-sm">${a.name}</h3>
            <p class="text-xs text-slate-500 font-mono">${a.rollNo}</p>
          </div>
          <span class="px-2 py-0.5 text-xs font-bold rounded-full ${a.status === 'ABSENT' ? 'bg-rose-100 text-rose-800' : 'bg-orange-100 text-orange-800'}">
            ${a.status}
          </span>
        </div>

        <div class="text-xs text-slate-600 space-y-1">
          <div><i class="fa-solid fa-building text-slate-400 mr-1.5"></i><strong>Location:</strong> ${a.block}, ${a.floor}, Room ${a.roomNo}</div>
          <div><i class="fa-solid fa-phone text-slate-400 mr-1.5"></i><strong>Student Phone:</strong> ${a.phone || 'N/A'}</div>
          <div><i class="fa-solid fa-user-shield text-slate-400 mr-1.5"></i><strong>Parent Phone:</strong> ${a.parentPhone || 'N/A'}</div>
        </div>

        <div class="pt-2 flex flex-wrap gap-2 text-xs">
          ${a.whatsappStudentUrl ? `
            <a href="${a.whatsappStudentUrl}" target="_blank" class="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg font-semibold flex items-center space-x-1">
              <i class="fa-brands fa-whatsapp"></i>
              <span>WhatsApp Student</span>
            </a>
          ` : ''}

          ${a.whatsappParentUrl ? `
            <a href="${a.whatsappParentUrl}" target="_blank" class="bg-teal-600 hover:bg-teal-500 text-white px-2.5 py-1.5 rounded-lg font-semibold flex items-center space-x-1">
              <i class="fa-brands fa-whatsapp"></i>
              <span>WhatsApp Parent</span>
            </a>
          ` : ''}

          ${a.phone ? `
            <a href="tel:${a.phone}" class="bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg font-semibold flex items-center space-x-1 border border-slate-300">
              <i class="fa-solid fa-phone"></i>
              <span>Call</span>
            </a>
          ` : ''}
        </div>
      `;

      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading absentees:', err);
  }
}

// ==================== STUDENTS DIRECTORY TAB ====================

async function loadStudentsDirectory() {
  const search = document.getElementById('studentSearchInput').value;

  try {
    const res = await fetch(`${BASE_URL}/api/students?search=${encodeURIComponent(search)}`);
    const data = await res.json();
    const students = data.students || [];

    const tbody = document.getElementById('studentsTableBody');
    tbody.innerHTML = '';

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">No students found.</td></tr>`;
      return;
    }

    students.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition';

      tr.innerHTML = `
        <td class="p-3 font-mono font-semibold text-slate-700">${s.rollNo}</td>
        <td class="p-3 font-bold text-slate-800">${s.name}</td>
        <td class="p-3 text-slate-600">${s.block}</td>
        <td class="p-3 text-slate-600">${s.floor}</td>
        <td class="p-3 font-semibold text-slate-800">Room ${s.roomNo}</td>
        <td class="p-3 text-slate-600">${s.phone || '-'}</td>
        <td class="p-3 text-slate-600">${s.parentPhone || '-'}</td>
        <td class="p-3 text-center space-x-2">
          <button onclick="deleteStudent(${s.id})" class="text-rose-600 hover:text-rose-800 font-medium">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Populate dropdown in Leave Modal
    populateLeaveStudentDropdown(students);

  } catch (err) {
    console.error('Error loading students directory:', err);
  }
}

function populateLeaveStudentDropdown(students) {
  const select = document.getElementById('leaveStudentId');
  if (!select) return;
  select.innerHTML = '<option value="">Select a student...</option>';
  students.forEach(s => {
    select.innerHTML += `<option value="${s.id}">${s.name} (${s.rollNo} - Room ${s.roomNo})</option>`;
  });
}

// Add student handler
async function handleAddStudent(e) {
  e.preventDefault();

  const rollNo = document.getElementById('newRollNo').value.trim();
  const name = document.getElementById('newName').value.trim();
  const block = document.getElementById('newBlock').value;
  const floor = document.getElementById('newFloor').value;
  const roomNo = document.getElementById('newRoomNo').value.trim();
  const phone = document.getElementById('newPhone').value.trim();
  const parentPhone = document.getElementById('newParentPhone').value.trim();

  try {
    const res = await fetch(`${BASE_URL}/api/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rollNo, name, block, floor, roomNo, phone, parentPhone })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Student added successfully!', 'success');
      closeModal('addStudentModal');
      document.getElementById('addStudentForm').reset();
      refreshAllData();
    } else {
      alert(data.error || 'Failed to add student');
    }
  } catch (err) {
    console.error('Error adding student:', err);
  }
}

// Delete student
async function deleteStudent(id) {
  if (!confirm('Are you sure you want to delete this student?')) return;

  try {
    const res = await fetch(`${BASE_URL}/api/students/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Student deleted', 'success');
      refreshAllData();
    }
  } catch (err) {
    console.error('Error deleting student:', err);
  }
}

// Reset Demo 300 Students
async function resetDemoStudents() {
  if (!confirm('This will reset all attendance, leaves, and restore 300 default sample students. Continue?')) return;

  try {
    const res = await fetch(`${BASE_URL}/api/students/reset-demo`, { method: 'POST' });
    if (res.ok) {
      showToast('Reset to 300 sample students complete!', 'success');
      refreshAllData();
    }
  } catch (err) {
    console.error('Error resetting demo students:', err);
  }
}

// ==================== LEAVE MANAGEMENT TAB ====================

async function loadLeaves() {
  try {
    const res = await fetch(`${BASE_URL}/api/leaves`);
    const data = await res.json();
    const leaves = data.leaves || [];

    const tbody = document.getElementById('leavesTableBody');
    tbody.innerHTML = '';

    if (leaves.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">No active leave records found.</td></tr>`;
      return;
    }

    leaves.forEach(l => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition';

      tr.innerHTML = `
        <td class="p-3 font-bold text-slate-800">${l.student_name}</td>
        <td class="p-3 font-mono text-slate-600">${l.roll_no}</td>
        <td class="p-3 text-slate-600">${l.block}, Room ${l.room_no}</td>
        <td class="p-3 text-slate-700 font-semibold">${l.start_date}</td>
        <td class="p-3 text-slate-700 font-semibold">${l.end_date}</td>
        <td class="p-3 text-slate-600">${l.reason || '-'}</td>
        <td class="p-3 text-center">
          <button onclick="deleteLeave(${l.id})" class="text-rose-600 hover:text-rose-800 font-medium">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading leaves:', err);
  }
}

async function handleAddLeave(e) {
  e.preventDefault();

  const studentId = document.getElementById('leaveStudentId').value;
  const startDate = document.getElementById('leaveStartDate').value;
  const endDate = document.getElementById('leaveEndDate').value;
  const reason = document.getElementById('leaveReason').value;

  try {
    const res = await fetch(`${BASE_URL}/api/leaves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, startDate, endDate, reason })
    });

    if (res.ok) {
      showToast('Leave approved and recorded', 'success');
      closeModal('addLeaveModal');
      document.getElementById('addLeaveForm').reset();
      refreshAllData();
    }
  } catch (err) {
    console.error('Error granting leave:', err);
  }
}

async function deleteLeave(id) {
  if (!confirm('Are you sure you want to remove this leave entry?')) return;

  try {
    const res = await fetch(`${BASE_URL}/api/leaves/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Leave removed', 'success');
      refreshAllData();
    }
  } catch (err) {
    console.error('Error deleting leave:', err);
  }
}

// ==================== REPORTS TAB ====================

async function loadMonthlyReport() {
  const monthInput = document.getElementById('reportMonth');
  if (!monthInput.value) {
    monthInput.value = currentDate.slice(0, 7);
  }

  const month = monthInput.value;

  try {
    const res = await fetch(`${BASE_URL}/api/reports/monthly?month=${month}`);
    const data = await res.json();
    const report = data.report || [];

    const tbody = document.getElementById('monthlyReportBody');
    tbody.innerHTML = '';

    if (report.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">No report data for ${month}.</td></tr>`;
      return;
    }

    report.forEach(r => {
      const marked = r.total_marked || 0;
      const present = r.total_present || 0;
      const pct = marked > 0 ? Math.round((present / marked) * 100) : 0;

      let pctClass = 'text-slate-600 bg-slate-100';
      if (marked > 0) {
        if (pct >= 85) pctClass = 'text-emerald-800 bg-emerald-100 border border-emerald-200';
        else if (pct >= 75) pctClass = 'text-amber-800 bg-amber-100 border border-amber-200';
        else pctClass = 'text-rose-800 bg-rose-100 border border-rose-200';
      }

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition';

      tr.innerHTML = `
        <td class="p-3 font-mono font-semibold text-slate-700">${r.roll_no}</td>
        <td class="p-3 font-bold text-slate-800">${r.name}</td>
        <td class="p-3 text-slate-600">${r.block}, Room ${r.room_no}</td>
        <td class="p-3 font-semibold text-slate-700">${marked}</td>
        <td class="p-3 text-emerald-600 font-bold">${r.total_present || 0}</td>
        <td class="p-3 text-rose-600 font-bold">${r.total_absent || 0}</td>
        <td class="p-3 text-amber-600 font-bold">${r.total_leave || 0}</td>
        <td class="p-3">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${pctClass}">
            ${pct}%
          </span>
        </td>
      `;

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading monthly report:', err);
  }
}

function downloadDailyCSV() {
  window.location.href = `${BASE_URL}/api/reports/daily/csv?date=${currentDate}`;
}

function exportAbsenteesCSV() {
  downloadDailyCSV();
}

// ==================== CSV FILE IMPORT PARSER ====================

function handleCSVFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    const text = e.target.result;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length < 2) {
      alert('CSV file is empty or invalid');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const parsedStudents = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 3) {
        parsedStudents.push({
          rollNo: cols[0],
          name: cols[1],
          block: cols[2] || 'Block A',
          floor: cols[3] || 'Floor 1',
          roomNo: cols[4] || '101',
          phone: cols[5] || '',
          parentPhone: cols[6] || ''
        });
      }
    }

    if (parsedStudents.length > 0) {
      try {
        const res = await fetch(`${BASE_URL}/api/students/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ students: parsedStudents })
        });

        const data = await res.json();
        if (res.ok) {
          showToast(`Successfully imported ${data.count} students!`, 'success');
          closeModal('importCSVModal');
          refreshAllData();
        }
      } catch (err) {
        console.error('Error importing CSV:', err);
      }
    }
  };

  reader.readAsText(file);
}

// ==================== UTILS & MODALS ====================

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toastMessage');
  const iconEl = document.getElementById('toastIcon');

  msgEl.innerText = message;
  if (type === 'success') {
    iconEl.className = 'fa-solid fa-circle-check text-emerald-400 text-base';
  } else {
    iconEl.className = 'fa-solid fa-circle-xmark text-rose-400 text-base';
  }

  toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
  }, 2500);
}
