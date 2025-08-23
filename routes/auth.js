const express = require('express');
const { 
  register, 
  login, 
  getMe, 
  forgotPassword,
  resetPassword,
  updateDetails,
  updatePassword,
  logout
} = require('../controllers/auth');
const { protect } = require('../middleware/auth');
const { 
  authLimiter, 
  sensitiveOperationLimiter 
} = require('../middleware/rateLimiter');

const router = express.Router();

// Public routes
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/forgotpassword', sensitiveOperationLimiter, forgotPassword);
router.put('/resetpassword/:resettoken', sensitiveOperationLimiter, resetPassword);

// Protected routes (require authentication)
router.use(protect);

router.get('/me', getMe);
router.put('/updatedetails', updateDetails);
router.put('/updatepassword', updatePassword);
router.post('/logout', logout);

module.exports = router;
