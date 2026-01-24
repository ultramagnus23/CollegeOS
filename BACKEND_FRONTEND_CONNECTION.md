# CollegeOS - Backend & Frontend Connection Guide

## ⚠️ IMPORTANT: Backend Must Be Running

The frontend requires the backend API to be running on `http://localhost:5000`.

## Quick Start

### 1. Start Backend (REQUIRED)
```bash
cd backend
npm install  # If not done already
npm start    # or npm run dev for development
```

**Verify backend is running:**
- Open http://localhost:5000/health
- You should see: `{"success":true,"message":"College App Backend is running"...}`

### 2. Start Frontend
```bash
# In a new terminal, from project root
npm install  # If not done already
npm run dev
```

**Verify frontend is running:**
- Open http://localhost:8080
- You should see the CollegeOS interface

## Features Available

### 1. College Search
- **Endpoint**: `GET /api/colleges`
- **Frontend**: Colleges page shows all 1100+ colleges
- **Search**: Type in search box to filter colleges

### 2. Intelligent Search
- **Endpoint**: `POST /api/intelligent-search`
- **Usage**: Ask questions like:
  - "How to apply to UVA?"
  - "What is numerus fixus?"
  - "Do CBSE students need IELTS?"
- **Returns**: Context-aware answers with college recommendations

### 3. Chatbot
- **Endpoint**: `POST /api/chatbot/chat`
- **Frontend**: Chat interface in the app
- **Usage**: Ask questions about college applications

### 4. Research
- **Endpoint**: `GET /api/research/majors`
- **Frontend**: Research page for major-based search
- **Search by**: Major, country, program type

## Troubleshooting

### "App is empty / No colleges shown"

**Cause**: Backend is not running or not connected

**Solution**:
1. Make sure backend is running: `cd backend && npm start`
2. Check backend health: http://localhost:5000/health
3. Check browser console for errors
4. Verify database exists: `ls backend/database/college_app.db`

### "Chatbot doesn't work"

**Cause**: Backend chatbot route not registered or not connected

**Solution**:
1. Backend must be running
2. Check `/api/chatbot/status`: http://localhost:5000/api/chatbot/status
3. Should return: `{"success":true,"status":"online"}`

### "General search yields nothing"

**Cause**: Search query empty or backend not connected

**Solution**:
1. Type a search term (e.g., "engineering", "MIT")
2. Check network tab in browser DevTools
3. Verify request goes to `http://localhost:5000/api/colleges/search?q=...`

### "Deadlines must be added manually"

**Context**: The system has two approaches:
1. **Automatic**: Scraped from university websites (stored in `college_data` table)
2. **Manual**: User can add their own deadlines

**To get automatic deadlines**:
- Backend scraper needs to run: See `backend/src/services/webScraper.js`
- Refresh jobs run monthly: See `backend/src/jobs/dataRefresh.js`
- Check college data: `GET /api/colleges/:id/data?type=deadlines`

## Testing the Connection

### Test 1: Health Check
```bash
curl http://localhost:5000/health
# Expected: {"success":true,"message":"College App Backend is running"...}
```

### Test 2: Get Colleges
```bash
curl http://localhost:5000/api/colleges?limit=5
# Expected: JSON with 5 colleges
```

### Test 3: Search Colleges
```bash
curl "http://localhost:5000/api/colleges/search?q=MIT"
# Expected: JSON with MIT and related colleges
```

### Test 4: Intelligent Search
```bash
curl -X POST http://localhost:5000/api/intelligent-search \
  -H "Content-Type: application/json" \
  -d '{"query": "What is Studielink?"}'
# Expected: JSON with explanation of Studielink
```

### Test 5: Chatbot
```bash
curl -X POST http://localhost:5000/api/chatbot/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
# Expected: JSON with chatbot reply
```

## Database Verification

```bash
cd backend
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Expected: 1100

sqlite3 database/college_app.db "SELECT name, country FROM colleges LIMIT 5;"
# Expected: List of 5 colleges
```

## Port Configuration

- **Backend**: http://localhost:5000
- **Frontend**: http://localhost:8080

If you need to change ports:
- Backend: Update `backend/src/config/env.js`
- Frontend: Update `src/services/api.ts` (API_BASE_URL)

## Getting Help

If issues persist:
1. Check backend logs for errors
2. Check browser console for frontend errors
3. Verify `database/college_app.db` exists and has data
4. Make sure both backend and frontend are running simultaneously
