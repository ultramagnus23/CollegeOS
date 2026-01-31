const AuthService = require('../../src/services/authService');
const User = require('../../src/models/User');

describe('AuthService', () => {
  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        fullName: 'Test User',
        country: 'USA'
      };
      
      const result = await AuthService.register(
        userData.email,
        userData.password,
        userData.fullName,
        userData.country
      );
      
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(userData.email);
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });
    
    it('should throw error for duplicate email', async () => {
      const email = 'duplicate@example.com';
      
      // Register first user
      await AuthService.register(email, 'Pass123!', 'User One', 'USA');
      
      // Try to register again
      await expect(
        AuthService.register(email, 'Pass456!', 'User Two', 'UK')
      ).rejects.toThrow('User already exists');
    });
  });
  
  describe('login', () => {
    it('should login successfully with correct credentials', async () => {
      const email = 'login@example.com';
      const password = 'SecurePass123!';
      
      // Register user first
      await AuthService.register(email, password, 'Login User', 'USA');
      
      // Login
      const result = await AuthService.login(email, password);
      
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(email);
    });
    
    it('should fail with incorrect password', async () => {
      const email = 'wrongpass@example.com';
      
      await AuthService.register(email, 'CorrectPass123!', 'Test User', 'USA');
      
      await expect(
        AuthService.login(email, 'WrongPass123!')
      ).rejects.toThrow('Invalid email or password');
    });
  });
});