# 🚀 START HERE - CollegeOS Setup

## Quick Start (3 Steps)

### 1️⃣ Install Dependencies

```bash
# Backend dependencies (REQUIRED)
cd backend
npm install

# Frontend dependencies (REQUIRED)
cd ..
npm install
```

### 2️⃣ Verify Setup

```bash
# Run the pre-flight check
./check-setup.sh
```

**Expected output:** All checks pass ✅

### 3️⃣ Start Both Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

Wait for: `info: Server running on port 5000`

**Terminal 2 - Frontend:**
```bash
npm run dev
```

Wait for: Frontend running on `http://localhost:8080`

**Test:** Open http://localhost:8080 in your browser

## ⚠️ Troubleshooting "Blank App"

If the app appears blank:

1. **Check backend is running**
   - Visit: http://localhost:5000/health
   - Should see JSON response

2. **Check browser console** (Press F12)
   - Look for red errors
   - `ECONNREFUSED` means backend isn't running

3. **Check database has data**
   ```bash
   sqlite3 backend/database/college_app.db "SELECT COUNT(*) FROM colleges;"
   ```
   Should show: `1100`

See `APP_BLANK_TROUBLESHOOTING.md` for detailed help.

## 🎯 What Should Work

Once both servers are running:

✅ **College Search** - Browse 1100+ colleges
✅ **Search Bar** - Filter by name, program, country
✅ **Intelligent Search** - Ask questions
✅ **Chatbot** - Interactive assistance
✅ **Research** - Major-based college search

## 📝 Important

**Backend MUST run on port 5000**
**Frontend MUST run on port 8080**

Both must be running simultaneously for the app to work.
