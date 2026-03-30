// backend/src/models/StudentActivity.js
const dbManager = require('../config/database');

class StudentActivity {
  static ACTIVITY_TYPES = [
    'Academic','Art','Athletics: Club','Athletics: JV/Varsity','Career-Oriented',
    'Community Service (Volunteer)','Computer/Technology','Cultural','Dance',
    'Debate/Speech','Environmental','Family Responsibilities','Foreign Exchange',
    'Internship','Journalism/Publication','Junior ROTC','LGBT','Music: Instrumental',
    'Music: Vocal','Religious','Research','Robotics','School Spirit','Science/Math',
    'Social Justice','Student Government','Theater/Drama','Work (Paid)','Other'
  ];

  static TIER_DEFINITIONS = {
    1: { name:'Exceptional', description:'National/International achievement', keywords:['national','international','world','olympic','published','patent','ted','isef','usabo','usaco','imo','usa'] },
    2: { name:'Outstanding', description:'State/Regional achievement', keywords:['state','regional','district','county','all-state','semi-final','finalist'] },
    3: { name:'Strong', description:'School leadership or significant contribution', keywords:['president','captain','editor','founder','director','lead','head','chief','chair','organizer'] },
    4: { name:'Standard', description:'Participation and membership', keywords:[] }
  };

  static async create(studentId, data) {
    const pool = dbManager.getDatabase();
    const tier = data.tierRating || data.tier_rating || this.autoCalculateTier(data);
    const hoursPerWeek = data.hoursPerWeek || data.hours_per_week || 0;
    const weeksPerYear = data.weeksPerYear || data.weeks_per_year || 0;
    const yearsActive = this.countYearsActive(data);
    const totalHours = Math.round(hoursPerWeek * weeksPerYear * yearsActive);

    const { rows: orderRows } = await pool.query(
      'SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM student_activities WHERE student_id = $1',
      [studentId]
    );
    const nextOrder = orderRows[0]?.next_order || 1;

    const { rows } = await pool.query(
      `INSERT INTO student_activities (
        student_id, activity_name, activity_type, position_title, organization_name, description,
        grade_9, grade_10, grade_11, grade_12,
        hours_per_week, weeks_per_year, total_hours,
        awards_recognition, tier_rating,
        participation_during_school, participation_during_break, participation_all_year, participation_post_graduation,
        display_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING id`,
      [
        studentId,
        data.activityName || data.activity_name,
        data.activityType || data.activity_type,
        data.positionTitle || data.position_title || null,
        data.organizationName || data.organization_name || null,
        data.description || null,
        !!(data.grade9 || data.grade_9),
        !!(data.grade10 || data.grade_10),
        !!(data.grade11 || data.grade_11),
        !!(data.grade12 || data.grade_12),
        hoursPerWeek, weeksPerYear, totalHours,
        data.awardsRecognition || data.awards_recognition || null,
        tier,
        !!(data.participationDuringSchool || data.participation_during_school),
        !!(data.participationDuringBreak || data.participation_during_break),
        !!(data.participationAllYear || data.participation_all_year),
        !!(data.participationPostGraduation || data.participation_post_graduation),
        nextOrder
      ]
    );
    return this.findById(rows[0].id);
  }

  static async update(id, data) {
    const pool = dbManager.getDatabase();
    const existing = await this.findById(id);
    if (!existing) return null;
    const merged = { ...existing, ...data };
    const tier = data.tierRating || data.tier_rating || this.autoCalculateTier(merged);
    const hoursPerWeek = data.hoursPerWeek || data.hours_per_week || existing.hours_per_week || 0;
    const weeksPerYear = data.weeksPerYear || data.weeks_per_year || existing.weeks_per_year || 0;
    const yearsActive = this.countYearsActive(merged);
    const totalHours = Math.round(hoursPerWeek * weeksPerYear * yearsActive);

    await pool.query(
      `UPDATE student_activities SET
        activity_name=$1, activity_type=$2, position_title=$3, organization_name=$4, description=$5,
        grade_9=$6, grade_10=$7, grade_11=$8, grade_12=$9,
        hours_per_week=$10, weeks_per_year=$11, total_hours=$12,
        awards_recognition=$13, tier_rating=$14,
        participation_during_school=$15, participation_during_break=$16,
        participation_all_year=$17, participation_post_graduation=$18,
        updated_at=NOW()
       WHERE id=$19`,
      [
        data.activityName || data.activity_name || existing.activity_name,
        data.activityType || data.activity_type || existing.activity_type,
        data.positionTitle || data.position_title || existing.position_title,
        data.organizationName || data.organization_name || existing.organization_name,
        data.description || existing.description,
        data.grade9 !== undefined ? !!data.grade9 : (data.grade_9 !== undefined ? !!data.grade_9 : !!existing.grade_9),
        data.grade10 !== undefined ? !!data.grade10 : (data.grade_10 !== undefined ? !!data.grade_10 : !!existing.grade_10),
        data.grade11 !== undefined ? !!data.grade11 : (data.grade_11 !== undefined ? !!data.grade_11 : !!existing.grade_11),
        data.grade12 !== undefined ? !!data.grade12 : (data.grade_12 !== undefined ? !!data.grade_12 : !!existing.grade_12),
        hoursPerWeek, weeksPerYear, totalHours,
        data.awardsRecognition || data.awards_recognition || existing.awards_recognition,
        tier,
        data.participationDuringSchool !== undefined ? !!data.participationDuringSchool : !!existing.participation_during_school,
        data.participationDuringBreak !== undefined ? !!data.participationDuringBreak : !!existing.participation_during_break,
        data.participationAllYear !== undefined ? !!data.participationAllYear : !!existing.participation_all_year,
        data.participationPostGraduation !== undefined ? !!data.participationPostGraduation : !!existing.participation_post_graduation,
        id
      ]
    );
    return this.findById(id);
  }

  static autoCalculateTier(data) {
    const text = [
      data.activityName || data.activity_name || '',
      data.positionTitle || data.position_title || '',
      data.description || '',
      data.awardsRecognition || data.awards_recognition || ''
    ].join(' ').toLowerCase();
    for (const kw of this.TIER_DEFINITIONS[1].keywords) { if (text.includes(kw)) return 1; }
    for (const kw of this.TIER_DEFINITIONS[2].keywords) { if (text.includes(kw)) return 2; }
    for (const kw of this.TIER_DEFINITIONS[3].keywords) { if (text.includes(kw)) return 3; }
    return 4;
  }

  static countYearsActive(data) {
    let years = 0;
    if (data.grade9 || data.grade_9) years++;
    if (data.grade10 || data.grade_10) years++;
    if (data.grade11 || data.grade_11) years++;
    if (data.grade12 || data.grade_12) years++;
    return Math.max(1, years);
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM student_activities WHERE id = $1', [id]);
    return rows[0] || null;
  }

  static async findByStudentId(studentId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      'SELECT * FROM student_activities WHERE student_id = $1 ORDER BY display_order ASC',
      [studentId]
    );
    return rows;
  }

  static async reorder(studentId, activityIds) {
    const pool = dbManager.getDatabase();
    for (let i = 0; i < activityIds.length; i++) {
      await pool.query(
        'UPDATE student_activities SET display_order=$1, updated_at=NOW() WHERE id=$2 AND student_id=$3',
        [i + 1, activityIds[i], studentId]
      );
    }
    return this.findByStudentId(studentId);
  }

  static async delete(id) {
    const pool = dbManager.getDatabase();
    await pool.query('DELETE FROM student_activities WHERE id = $1', [id]);
    return true;
  }

  static async getTierSummary(studentId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT tier_rating, COUNT(*) as count, SUM(total_hours) as total_hours
       FROM student_activities WHERE student_id = $1
       GROUP BY tier_rating ORDER BY tier_rating ASC`,
      [studentId]
    );
    return {
      tier1: rows.find(r => r.tier_rating === 1) || { count: 0, total_hours: 0 },
      tier2: rows.find(r => r.tier_rating === 2) || { count: 0, total_hours: 0 },
      tier3: rows.find(r => r.tier_rating === 3) || { count: 0, total_hours: 0 },
      tier4: rows.find(r => r.tier_rating === 4) || { count: 0, total_hours: 0 },
      totalActivities: rows.reduce((s, r) => s + parseInt(r.count), 0),
      totalHours: rows.reduce((s, r) => s + (parseInt(r.total_hours) || 0), 0)
    };
  }
}

module.exports = StudentActivity;
