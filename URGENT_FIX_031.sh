#!/bin/bash

# URGENT FIX FOR MIGRATION 031 ERROR
# Run this script: bash URGENT_FIX_031.sh

echo "🔍 Checking your migration 031 file..."
echo ""

# Check if file exists
if [ ! -f "backend/migrations/031_application_deadlines.sql" ]; then
    echo "❌ Migration file not found!"
    exit 1
fi

# Check for the problematic pattern
if grep -q "FROM colleges" backend/migrations/031_application_deadlines.sql; then
    echo "❌ FOUND THE PROBLEM!"
    echo ""
    echo "Your file has SELECT FROM colleges statements (BAD)"
    echo "Line numbers:"
    grep -n "FROM colleges" backend/migrations/031_application_deadlines.sql
    echo ""
    echo "🔧 FIXING NOW..."
    echo ""
    
    # Force get correct version from repo
    git fetch origin copilot/remove-duplicate-data-files
    git checkout origin/copilot/remove-duplicate-data-files -- backend/migrations/031_application_deadlines.sql
    
    echo "✅ File updated from repository"
    echo ""
else
    echo "✅ Your file looks correct (no SELECT FROM colleges)"
    echo ""
fi

# Now check again
echo "🔍 Verifying file is now correct..."
if grep -q "FROM colleges" backend/migrations/031_application_deadlines.sql; then
    echo "❌ Still has problems. Let me show you the bad lines:"
    grep -n "FROM colleges" backend/migrations/031_application_deadlines.sql
    echo ""
    echo "⚠️  Manual fix needed. See below."
    echo ""
    echo "MANUAL FIX:"
    echo "1. Open backend/migrations/031_application_deadlines.sql"
    echo "2. Delete ALL lines containing 'FROM colleges'"
    echo "3. Delete ALL lines containing 'WHERE offers_'"
    echo "4. Save the file"
else
    echo "✅ File is correct!"
fi

echo ""
echo "📊 File stats:"
wc -l backend/migrations/031_application_deadlines.sql
echo ""

# Delete old database
echo "🗑️  Deleting old database..."
rm -f backend/database/college_app.db
echo "✅ Database deleted"
echo ""

# Run migrations
echo "🚀 Running migrations..."
cd backend
npm run migrate

echo ""
echo "✅ DONE!"
echo ""
echo "If it still fails, run:"
echo "  cat backend/migrations/031_application_deadlines.sql | grep -n 'FROM colleges'"
echo ""
echo "And send me the output."
