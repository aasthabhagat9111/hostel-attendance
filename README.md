# 🏨 Hostel Night Attendance System (for 300 Students)

A fast, mobile-friendly fullstack application designed specifically for hostel wardens to conduct nightly roll calls efficiently across 300+ students.

---

## ⚡ Features

1. **Warden Roll Call (Room-by-Room View)**:
   - Grouped by Block (A, B, C), Floor, and Room number.
   - **One-Tap "Mark Room Present"**: Marks all students in a room present in 1 second.
   - **Touch-Friendly Toggles**: Present, Absent, On Leave, Late.
   - **Filter & Search**: Quick search by student name, roll number, or room number.
   - **Unmarked Only Filter**: Quickly spot who hasn't been checked yet.
   - **Bulk "Mark Unmarked Present"**: Complete roll call in seconds.

2. **🚨 Absentees & Emergency Contact**:
   - Live dashboard of tonight's absentees and late arrivals.
   - **1-Click WhatsApp Student**: Opens WhatsApp with pre-filled attendance alert.
   - **1-Click WhatsApp Parent**: Directly notify parents of missing students.
   - Direct Call links for instant phone calls.

3. **👨‍🎓 300 Student Management**:
   - Seeded automatically with 300 demo students (3 Blocks, 5 Floors, 150 Rooms, 2 students/room).
   - Add/Edit/Delete student records.
   - **CSV Import**: Upload student list directly from Excel/CSV.
   - **Reset Demo Data**: Easily reset to initial 300 student test setup anytime.

4. **🏖️ Leave & Outpass Integration**:
   - Pre-approve home leaves with start/end dates.
   - Approved students automatically display **ON LEAVE** status during nightly roll call.

5. **📊 Attendance Reports**:
   - Monthly percentage tracker per student.
   - Download Daily Attendance Sheet in CSV format for administrative record-keeping.

---

## 🚀 How to Run

1. Open terminal in the project directory:
   ```bash
   cd hostel-attendance
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser or phone browser at:
   ```
   http://localhost:3000
   ```

---

## 📁 Project Structure

```
hostel-attendance/
├── server.js          # Express REST API endpoints & CSV report generator
├── database.js        # SQLite database connection & 300-student seed generator
├── hostel.db          # SQLite database file (created automatically)
├── package.json       # Node.js dependencies
└── public/
    ├── index.html     # Responsive Tailwind CSS Web Dashboard
    └── app.js         # Single Page App UI state & API interaction logic
```
