#!/bin/bash
# Pre-flight check before starting CollegeOS

echo "======================================"
echo "CollegeOS Pre-Flight Check"
echo "======================================"
echo ""

ERROR=0

# Check 1: Database exists
echo "1. Checking database..."
if [ -f "backend/database/college_app.db" ]; then
  echo "   ✅ Database file exists"
  
  # Count colleges
  COUNT=$(sqlite3 backend/database/college_app.db "SELECT COUNT(*) FROM colleges;" 2>/dev/null || echo "0")
  if [ "$COUNT" -gt "0" ]; then
    echo "   ✅ Database has $COUNT colleges"
  else
    echo "   ❌ Database is empty - run: cd backend && node scripts/seedCollegesNew.js"
    ERROR=1
  fi
else
  echo "   ❌ Database file missing"
  echo "      Run: cd backend && node scripts/seedCollegesNew.js"
  ERROR=1
fi
echo ""

# Check 2: Backend node_modules
echo "2. Checking backend dependencies..."
if [ -d "backend/node_modules" ]; then
  echo "   ✅ Backend node_modules exists"
  
  # Check for key modules
  if [ -d "backend/node_modules/better-sqlite3" ]; then
    echo "   ✅ better-sqlite3 installed"
  else
    echo "   ❌ better-sqlite3 missing - run: cd backend && npm install"
    ERROR=1
  fi
  
  if [ -d "backend/node_modules/express" ]; then
    echo "   ✅ express installed"
  else
    echo "   ❌ express missing - run: cd backend && npm install"
    ERROR=1
  fi
else
  echo "   ❌ Backend dependencies not installed"
  echo "      Run: cd backend && npm install"
  ERROR=1
fi
echo ""

# Check 3: Frontend node_modules
echo "3. Checking frontend dependencies..."
if [ -d "node_modules" ]; then
  echo "   ✅ Frontend node_modules exists"
else
  echo "   ❌ Frontend dependencies not installed"
  echo "      Run: npm install"
  ERROR=1
fi
echo ""

# Check 4: Backend running (optional, don't fail if not)
echo "4. Checking if backend is running..."
if curl -s http://localhost:5000/health > /dev/null 2>&1; then
  echo "   ✅ Backend is running on port 5000"
else
  echo "   ⚠️  Backend is not running (this is OK if you haven't started it yet)"
  echo "      To start: cd backend && npm start"
fi
echo ""

echo "======================================"
if [ $ERROR -eq 0 ]; then
  echo "✅ All checks passed!"
  echo ""
  echo "To start the application:"
  echo "  Terminal 1: cd backend && npm start"
  echo "  Terminal 2: npm run dev"
else
  echo "❌ Some checks failed. Please fix the issues above."
fi
echo "======================================"
