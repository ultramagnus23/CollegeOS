const { generateTimelineActions, getMonthlyActions } = require('../services/timelineService');
const db = require('../config/database');

exports.generate = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await generateTimelineActions(userId);
    
    res.json({
      success: true,
      message: 'Timeline generated successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.getMonthly = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { month, year } = req.query;
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();
    
    const actions = await getMonthlyActions(userId, parseInt(currentMonth), parseInt(currentYear));
    
    res.json({
      success: true,
      data: actions
    });
  } catch (error) {
    next(error);
  }
};

exports.completeAction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { completed } = req.body;
    const userId = req.user.id;
    
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE timeline_actions 
         SET completed = ?, completed_date = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
         WHERE id = ? AND user_id = ?`,
        [completed ? 1 : 0, completed ? 1 : 0, id, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};