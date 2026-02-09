# Running Backend Scripts from Root Directory

The scraping and monitoring scripts are in the backend, but can be run from the root directory using these commands:

## Scraping Commands

```bash
# Initialize the scraping queue with all colleges
npm run scrape:init

# Get today's batch of colleges to scrape
npm run scrape:batch

# Record daily scraping statistics
npm run scrape:stats

# View queue and freshness metrics
npm run scrape:metrics
```

## Monitoring Commands

```bash
# Generate comprehensive monitoring report
npm run monitor:report

# Export ML training dataset
npm run monitor:ml-export
```

## Backend Commands

```bash
# Start backend server in development mode
npm run backend:dev

# Start backend server in production mode
npm run backend:start

# Run database migrations
npm run backend:migrate

# Seed database with college data
npm run backend:seed
```

## Important Notes

1. **Working Directory**: All these commands automatically switch to the `backend` directory before running.

2. **Dependencies**: Make sure backend dependencies are installed first:
   ```bash
   cd backend
   npm install
   cd ..
   ```

3. **Database Setup**: Before running scraping commands, ensure:
   - Database migrations are run: `npm run backend:migrate`
   - Database is seeded: `npm run backend:seed`

4. **Direct Backend Access**: You can also run commands directly from the backend directory:
   ```bash
   cd backend
   npm run monitor:report
   npm run monitor:ml-export
   ```

## Troubleshooting

### Error: Missing script
If you see "Missing script" error, make sure you're running commands from the root directory or have updated to the latest version.

### Error: Cannot find module
If you see "Cannot find module 'better-sqlite3'" or similar, install backend dependencies:
```bash
cd backend
npm install
```

### Database Errors
If you encounter database errors, run migrations:
```bash
npm run backend:migrate
```
