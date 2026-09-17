const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'hostel.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roll_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      room_no TEXT NOT NULL,
      floor TEXT NOT NULL,
      block TEXT NOT NULL,
      phone TEXT,
      parent_phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'APPROVED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date DATE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE')),
      remarks TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, date),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_students_room ON students(block, floor, room_no);
  `);

  // Check if students exist, if not generate 300 realistic sample students
  const studentCount = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  if (studentCount === 0) {
    seedSampleStudents(300);
  }
}

function seedSampleStudents(targetCount = 300) {
  const firstNames = [
    'Aarav', 'Ananya', 'Rohan', 'Priya', 'Aditya', 'Sanya', 'Kabir', 'Isha', 'Vivaan', 'Diya',
    'Arjun', 'Sneha', 'Rahul', 'Kavya', 'Dev', 'Anushka', 'Yash', 'Riya', 'Karan', 'Neha',
    'Vikram', 'Pooja', 'Amit', 'Shruti', 'Siddharth', 'Tanvi', 'Manish', 'Meera', 'Nikhil', 'Simran',
    'Varun', 'Tarun', 'Shreya', 'Gaurav', 'Rishi', 'Kirti', 'Abhishek', 'Bhavna', 'Harsh', 'Payal'
  ];

  const lastNames = [
    'Sharma', 'Verma', 'Gupta', 'Patel', 'Singh', 'Kumar', 'Reddy', 'Joshi', 'Mehta', 'Nair',
    'Rao', 'Agarwal', 'Bhasin', 'Chawla', 'Deshmukh', 'Gowda', 'Iyer', 'Jain', 'Kapoor', 'Malhotra'
  ];

  const blocks = ['Block A', 'Block B', 'Block C'];
  const floors = ['Ground Floor', 'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4'];
  
  const insertStudent = db.prepare(`
    INSERT INTO students (roll_no, name, room_no, floor, block, phone, parent_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((students) => {
    for (const student of students) {
      insertStudent.run(
        student.rollNo,
        student.name,
        student.roomNo,
        student.floor,
        student.block,
        student.phone,
        student.parentPhone
      );
    }
  });

  const studentsList = [];
  let count = 0;
  
  // Distribute 300 students across 3 blocks, 5 floors per block, 10 rooms per floor, 2 students per room
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    for (let f = 0; f < floors.length; f++) {
      const floor = floors[f];
      const floorNum = f;
      for (let r = 1; r <= 10; r++) {
        const roomNo = `${b + 1}0${floorNum}${r < 10 ? '0' + r : r}`; // e.g. 10001 or 101, 102
        const cleanRoomNo = `${(b + 1)}${floorNum}${r < 10 ? '0' + r : r}`;
        
        // 2 students per room = 3 blocks * 5 floors * 10 rooms * 2 = 300 students
        for (let bed = 1; bed <= 2; bed++) {
          if (count >= targetCount) break;
          count++;

          const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
          const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
          const rollNo = `2024HST${String(count).padStart(3, '0')}`;
          const phone = `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`;
          const parentPhone = `+91 94${Math.floor(10000000 + Math.random() * 90000000)}`;

          studentsList.push({
            rollNo,
            name: `${fn} ${ln}`,
            roomNo: cleanRoomNo,
            floor,
            block,
            phone,
            parentPhone
          });
        }
      }
    }
  }

  insertMany(studentsList);
  console.log(`Successfully seeded ${studentsList.length} students into database.`);
}

module.exports = {
  db,
  initDb,
  seedSampleStudents
};
