// backend/server.js - COMPLETE VERSION
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Import ALL routes
const authRoutes = require('./routes/auth');
const collegesRoutes = require('./routes/colleges');
const applicationsRoutes = require('./routes/applications');
const deadlinesRoutes = require('./routes/deadlines');
const timelineRoutes = require('./routes/timeline');
const profileRoutes = require('./routes/profile');
// Add with other route imports
const recommendationsRoutes = require('./routes/recommendations');
const timelineRoutes = require('./routes/timeline');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/colleges', collegesRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/deadlines', deadlinesRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/profile', profileRoutes);
// Add with other route mounts
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/timeline', timelineRoutes);
// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'CollegeOS API Running' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🎓 CollegeOS API running on http://localhost:${PORT}\n`);
});

module.exports = app;



