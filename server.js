const express = require('express');
const path = require('path');
const { db, initDb, seedSampleStudents } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB schema & seed data if empty
initDb();

// Helper to get today's date in YYYY-MM-DD format
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==================== ATTENDANCE API ====================

// Get Summary Stats for a Date
app.get('/api/attendance/summary', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    
    const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;

    const stats = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'LEAVE' THEN 1 ELSE 0 END) as leave,
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as late
      FROM attendance
      WHERE date = ?
    `).get(date);

    const present = stats.present || 0;
    const absent = stats.absent || 0;
    const leave = stats.leave || 0;
    const late = stats.late || 0;
    const marked = present + absent + leave + late;
    const unmarked = Math.max(0, totalStudents - marked);

    // Get block breakdown
    const blockStats = db.prepare(`
      SELECT 
        s.block,
        COUNT(s.id) as total,
        SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END) as leave,
        SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) as late
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
      GROUP BY s.block
      ORDER BY s.block
    `).all(date);

    res.json({
      date,
      totalStudents,
      present,
      absent,
      leave,
      late,
      marked,
      unmarked,
      completionRate: totalStudents > 0 ? Math.round((marked / totalStudents) * 100) : 0,
      blockStats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get Roll Call list grouped or filtered
app.get('/api/attendance', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const block = req.query.block || '';
    const floor = req.query.floor || '';
    const search = req.query.search ? req.query.search.trim() : '';
    const unmarkedOnly = req.query.unmarkedOnly === 'true';

    let query = `
      SELECT 
        s.id, s.roll_no, s.name, s.room_no, s.floor, s.block, s.phone, s.parent_phone,
        a.status, a.remarks, a.updated_at,
        (
          SELECT COUNT(*) FROM leaves l 
          WHERE l.student_id = s.id 
            AND l.status = 'APPROVED'
            AND ? BETWEEN l.start_date AND l.end_date
        ) as has_active_leave
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
      WHERE 1=1
    `;

    const params = [date, date];

    if (block) {
      query += ` AND s.block = ?`;
      params.push(block);
    }

    if (floor) {
      query += ` AND s.floor = ?`;
      params.push(floor);
    }

    if (search) {
      query += ` AND (s.name LIKE ? OR s.roll_no LIKE ? OR s.room_no LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (unmarkedOnly) {
      query += ` AND a.status IS NULL`;
    }

    query += ` ORDER BY s.block ASC, s.floor ASC, s.room_no ASC, s.roll_no ASC`;

    const rows = db.prepare(query).all(...params);

    // Format output and check auto-leave flag
    const students = rows.map(r => {
      let status = r.status || null;
      // If unmarked but has active leave, surface auto LEAVE status indication
      let autoLeave = false;
      if (!status && r.has_active_leave > 0) {
        status = 'LEAVE';
        autoLeave = true;
      }
      return {
        id: r.id,
        rollNo: r.roll_no,
        name: r.name,
        roomNo: r.room_no,
        floor: r.floor,
        block: r.block,
        phone: r.phone,
        parentPhone: r.parent_phone,
        status: status,
        remarks: r.remarks || '',
        updatedAt: r.updated_at,
        autoLeave
      };
    });

    res.json({ date, count: students.length, students });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mark single student attendance
app.post('/api/attendance', (req, res) => {
  try {
    const { studentId, date = getTodayString(), status, remarks = '' } = req.body;

    if (!studentId || !status) {
      return res.status(400).json({ error: 'studentId and status are required' });
    }

    if (!['PRESENT', 'ABSENT', 'LATE', 'LEAVE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const stmt = db.prepare(`
      INSERT INTO attendance (student_id, date, status, remarks, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, date) DO UPDATE SET
        status = excluded.status,
        remarks = excluded.remarks,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(studentId, date, status, remarks);
    res.json({ success: true, studentId, date, status, remarks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mark Room Attendance Bulk (e.g. mark entire Room 101 Present)
app.post('/api/attendance/bulk-room', (req, res) => {
  try {
    const { date = getTodayString(), roomNo, block, status } = req.body;

    if (!roomNo || !status) {
      return res.status(400).json({ error: 'roomNo and status are required' });
    }

    let studentQuery = 'SELECT id FROM students WHERE room_no = ?';
    const params = [roomNo];
    if (block) {
      studentQuery += ' AND block = ?';
      params.push(block);
    }

    const roomStudents = db.prepare(studentQuery).all(...params);

    const upsertStmt = db.prepare(`
      INSERT INTO attendance (student_id, date, status, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, date) DO UPDATE SET
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `);

    const markMany = db.transaction((students) => {
      for (const s of students) {
        upsertStmt.run(s.id, date, status);
      }
    });

    markMany(roomStudents);

    res.json({ success: true, updatedCount: roomStudents.length, roomNo, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mark all currently unmarked students in a block/floor to PRESENT
app.post('/api/attendance/mark-all-unmarked-present', (req, res) => {
  try {
    const { date = getTodayString(), block, floor } = req.body;

    let studentQuery = `
      SELECT s.id 
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
      WHERE a.status IS NULL
    `;
    const params = [date];

    if (block) {
      studentQuery += ' AND s.block = ?';
      params.push(block);
    }
    if (floor) {
      studentQuery += ' AND s.floor = ?';
      params.push(floor);
    }

    const unmarkedStudents = db.prepare(studentQuery).all(...params);

    const upsertStmt = db.prepare(`
      INSERT INTO attendance (student_id, date, status, updated_at)
      VALUES (?, ?, 'PRESENT', CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, date) DO UPDATE SET
        status = 'PRESENT',
        updated_at = CURRENT_TIMESTAMP
    `);

    const markMany = db.transaction((students) => {
      for (const s of students) {
        upsertStmt.run(s.id, date);
      }
    });

    markMany(unmarkedStudents);

    res.json({ success: true, count: unmarkedStudents.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get Absentee / Alert list
app.get('/api/attendance/absentees', (req, res) => {
  try {
    const date = req.query.date || getTodayString();

    const absentees = db.prepare(`
      SELECT 
        s.id, s.roll_no, s.name, s.room_no, s.floor, s.block, s.phone, s.parent_phone,
        a.status, a.remarks, a.updated_at
      FROM attendance a
      JOIN students s ON s.id = a.student_id
      WHERE a.date = ? AND a.status IN ('ABSENT', 'LATE')
      ORDER BY s.block ASC, s.floor ASC, s.room_no ASC
    `).all(date);

    const formatted = absentees.map(s => {
      const msg = encodeURIComponent(`Night Attendance Notice (${date}): Student ${s.name} (Roll: ${s.roll_no}, Room: ${s.room_no}, ${s.block}) was marked ${s.status} during night roll call.`);
      const cleanPhone = (s.phone || '').replace(/[^0-9]/g, '');
      const cleanParentPhone = (s.parent_phone || '').replace(/[^0-9]/g, '');

      return {
        id: s.id,
        rollNo: s.roll_no,
        name: s.name,
        roomNo: s.room_no,
        floor: s.floor,
        block: s.block,
        phone: s.phone,
        parentPhone: s.parent_phone,
        status: s.status,
        remarks: s.remarks,
        updatedAt: s.updated_at,
        whatsappStudentUrl: cleanPhone ? `https://wa.me/${cleanPhone}?text=${msg}` : null,
        whatsappParentUrl: cleanParentPhone ? `https://wa.me/${cleanParentPhone}?text=${msg}` : null
      };
    });

    res.json({ date, count: formatted.length, absentees: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== STUDENTS CRUD ====================

app.get('/api/students', (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : '';
    const block = req.query.block || '';
    const floor = req.query.floor || '';

    let query = 'SELECT * FROM students WHERE 1=1';
    const params = [];

    if (block) {
      query += ' AND block = ?';
      params.push(block);
    }
    if (floor) {
      query += ' AND floor = ?';
      params.push(floor);
    }
    if (search) {
      query += ' AND (name LIKE ? OR roll_no LIKE ? OR room_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY block, floor, room_no, roll_no';

    const rows = db.prepare(query).all(...params);

    // Get filter option lists
    const blocks = db.prepare('SELECT DISTINCT block FROM students ORDER BY block').all().map(r => r.block);
    const floors = db.prepare('SELECT DISTINCT floor FROM students ORDER BY floor').all().map(r => r.floor);

    res.json({
      count: rows.length,
      blocks,
      floors,
      students: rows.map(r => ({
        id: r.id,
        rollNo: r.roll_no,
        name: r.name,
        roomNo: r.room_no,
        floor: r.floor,
        block: r.block,
        phone: r.phone,
        parentPhone: r.parent_phone
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/students', (req, res) => {
  try {
    const { rollNo, name, roomNo, floor, block, phone = '', parentPhone = '' } = req.body;

    if (!rollNo || !name || !roomNo || !floor || !block) {
      return res.status(400).json({ error: 'Roll No, Name, Room No, Floor, and Block are required.' });
    }

    const stmt = db.prepare(`
      INSERT INTO students (roll_no, name, room_no, floor, block, phone, parent_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(rollNo, name, roomNo, floor, block, phone, parentPhone);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: `Student with Roll Number '${req.body.rollNo}' already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/students/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { rollNo, name, roomNo, floor, block, phone, parentPhone } = req.body;

    const stmt = db.prepare(`
      UPDATE students 
      SET roll_no = ?, name = ?, room_no = ?, floor = ?, block = ?, phone = ?, parent_phone = ?
      WHERE id = ?
    `);

    const result = stmt.run(rollNo, name, roomNo, floor, block, phone, parentPhone, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/students/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM students WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Import JSON list of students (from CSV parser frontend)
app.post('/api/students/import', (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty students array.' });
    }

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO students (roll_no, name, room_no, floor, block, phone, parent_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    const transaction = db.transaction((list) => {
      for (const s of list) {
        if (s.rollNo && s.name && s.roomNo) {
          insertStmt.run(
            s.rollNo,
            s.name,
            s.roomNo,
            s.floor || 'Floor 1',
            s.block || 'Block A',
            s.phone || '',
            s.parentPhone || ''
          );
          imported++;
        }
      }
    });

    transaction(students);

    res.json({ success: true, count: imported });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Reset database to 300 sample students
app.post('/api/students/reset-demo', (req, res) => {
  try {
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM leaves').run();
    db.prepare('DELETE FROM students').run();
    seedSampleStudents(300);
    res.json({ success: true, message: 'Reset to 300 demo students successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== LEAVE MANAGEMENT ====================

app.get('/api/leaves', (req, res) => {
  try {
    const leaves = db.prepare(`
      SELECT l.id, l.student_id, l.start_date, l.end_date, l.reason, l.status, l.created_at,
             s.name as student_name, s.roll_no, s.room_no, s.block
      FROM leaves l
      JOIN students s ON s.id = l.student_id
      ORDER BY l.start_date DESC
    `).all();

    res.json({ leaves });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leaves', (req, res) => {
  try {
    const { studentId, startDate, endDate, reason = '' } = req.body;

    if (!studentId || !startDate || !endDate) {
      return res.status(400).json({ error: 'studentId, startDate, and endDate are required.' });
    }

    const stmt = db.prepare(`
      INSERT INTO leaves (student_id, start_date, end_date, reason, status)
      VALUES (?, ?, ?, ?, 'APPROVED')
    `);

    stmt.run(studentId, startDate, endDate, reason);

    // Also automatically backfill/upsert attendance for today if date falls in leave range
    const today = getTodayString();
    if (today >= startDate && today <= endDate) {
      db.prepare(`
        INSERT INTO attendance (student_id, date, status, remarks)
        VALUES (?, ?, 'LEAVE', 'On Leave')
        ON CONFLICT(student_id, date) DO UPDATE SET status = 'LEAVE', remarks = 'On Leave'
      `).run(studentId, today);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/leaves/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM leaves WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== REPORTS & EXPORT ====================

// Monthly Report Endpoint
app.get('/api/reports/monthly', (req, res) => {
  try {
    const month = req.query.month || getTodayString().slice(0, 7); // YYYY-MM
    
    const report = db.prepare(`
      SELECT 
        s.id, s.roll_no, s.name, s.room_no, s.floor, s.block,
        COUNT(a.id) as total_marked,
        SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as total_present,
        SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as total_absent,
        SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END) as total_leave,
        SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) as total_late
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id AND strftime('%Y-%m', a.date) = ?
      GROUP BY s.id
      ORDER BY s.block, s.floor, s.room_no, s.roll_no
    `).all(month);

    res.json({ month, report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Daily CSV Export
app.get('/api/reports/daily/csv', (req, res) => {
  try {
    const date = req.query.date || getTodayString();

    const records = db.prepare(`
      SELECT 
        s.roll_no, s.name, s.block, s.floor, s.room_no, s.phone, s.parent_phone,
        COALESCE(a.status, 'UNMARKED') as status,
        COALESCE(a.remarks, '') as remarks,
        COALESCE(a.updated_at, '') as updated_at
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
      ORDER BY s.block, s.floor, s.room_no, s.roll_no
    `).all(date);

    let csv = 'Roll No,Name,Block,Floor,Room No,Status,Remarks,Phone,Parent Phone,Timestamp\n';
    records.forEach(r => {
      csv += `"${r.roll_no}","${r.name}","${r.block}","${r.floor}","${r.room_no}","${r.status}","${r.remarks}","${r.phone}","${r.parent_phone}","${r.updated_at}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="night_attendance_${date}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Hostel Night Attendance App running at http://0.0.0.0:${PORT}`);
});
