#!/bin/bash
# Fresh start script - Completely resets the database

echo "🔥 CollegeOS Fresh Database Setup"
echo "=================================="
echo ""
echo "⚠️  WARNING: This will DELETE your existing database!"
echo "     All data will be lost."
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Cancelled."
    exit 1
fi

echo ""
echo "Step 1: Checking for .env overrides..."

# Check if .env file exists and has DATABASE_PATH set incorrectly
if [ -f ".env" ]; then
    if grep -q "DATABASE_PATH.*database\.sqlite" .env; then
        echo "⚠️  Found DATABASE_PATH=./database.sqlite in .env file"
        echo "   This is the OLD path. We need to update it."
        echo ""
        read -p "Update .env file to use correct path? (y/N): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Backup original .env
            cp .env .env.backup
            # Update DATABASE_PATH (only first occurrence)
            sed -i 's|DATABASE_PATH=./database\.sqlite|DATABASE_PATH=./database/college_app.db|' .env
            echo "✅ Updated .env file (backup saved as .env.backup)"
        else
            echo "⚠️  Continuing with current .env (may cause path issues)"
        fi
        echo ""
    fi
fi

# Override DATABASE_PATH for this script to ensure correct path is used
export DATABASE_PATH=./database/college_app.db

echo ""
echo "Step 2: Removing old database files..."

# Remove any existing database files
rm -f database/college_app.db
rm -f database/college_app.db-journal
rm -f database/college_app.db-shm
rm -f database/college_app.db-wal
rm -f database.sqlite
rm -f database.sqlite-journal
rm -f database.sqlite-shm
rm -f database.sqlite-wal

echo "✅ Old database files removed"
echo ""

echo "Step 3: Running migrations to create schema..."
node scripts/runMigrations.js

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Migrations failed!"
    echo "   Check the error messages above."
    exit 1
fi

echo ""
echo "Step 4: Seeding database with 1100 colleges..."
node scripts/seedCollegesNew.js

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Seeding failed!"
    echo "   Check the error messages above."
    exit 1
fi

echo ""
echo "=================================="
echo "✅ Fresh database setup complete!"
echo ""
echo "Database location: database/college_app.db"
echo ""
echo "Next steps:"
echo "  1. Start backend: npm start"
echo "  2. In another terminal, start frontend: npm run dev"
echo ""
