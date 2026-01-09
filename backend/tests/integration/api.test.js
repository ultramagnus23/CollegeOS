const request = require('supertest');
const app = require('../../src/app');

describe('API Integration Tests', () => {
  let authToken;
  let userId;
  
  beforeAll(async () => {
    // Register and login
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'integration@test.com',
        password: 'TestPass123!',
        fullName: 'Integration Test',
        country: 'USA'
      });
    
    authToken = registerRes.body.data.tokens.accessToken;
    userId = registerRes.body.data.user.id;
  });
  
  describe('Colleges API', () => {
    it('GET /api/colleges should return list of colleges', async () => {
      const res = await request(app)
        .get('/api/colleges')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
    
    it('GET /api/colleges/search should search colleges', async () => {
      const res = await request(app)
        .get('/api/colleges/search?q=Harvard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
  
  describe('Applications API', () => {
    let applicationId;
    
    it('POST /api/applications should create application', async () => {
      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          collegeId: 1,
          priority: 'target',
          notes: 'Test application'
        })
        .expect(201);
      
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      applicationId = res.body.data.id;
    });
    
    it('GET /api/applications should return user applications', async () => {
      const res = await request(app)
        .get('/api/applications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
    
    it('GET /api/applications/:id/timeline should return timeline', async () => {
      const res = await request(app)
        .get(`/api/applications/${applicationId}/timeline`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('milestones');
    });
  });
  
  describe('Research API', () => {
    it('POST /api/research/on-demand should conduct research', async () => {
      const res = await request(app)
        .post('/api/research/on-demand')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          collegeId: 1,
          researchType: 'requirements',
          forceRefresh: false
        })
        .expect(200);
      
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('sources');
    });
  });
});