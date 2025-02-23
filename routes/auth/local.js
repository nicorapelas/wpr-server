const express = require('express')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const passport = require('passport')
const User = mongoose.model('User')
const keys = require('../../config/keys').keys
const requireAuth = require('../../middlewares/requireAuth')

const router = express.Router()

// Forgot password mailer options
mailManForgotPassword = (email, token) => {
  const mailOptionsForgotPassword = {
    from: 'nicorapelas@cvcloud.com',
    to: email,
    subject: 'CV Cloud - User authentication',
    template: 'resetPasswordTemplate',
    context: {
      token,
    },
  }
  transporter.sendMail(mailOptionsForgotPassword, (error, info) => {
    if (error) {
      console.log(error)
    } else {
      console.log('Email sent: ' + info.response)
    }
  })
}

// @route  POST /auth/user/fetch-user
// @desc   Fetch current user
// @access public
router.get('/fetch-user', requireAuth, (req, res) => {
  try {
    const user = req.user
    if (!user) {
      res.json({ error: 'no user' })
      return
    } else {
      res.json(user)
      return
    }
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: 'Server error' })
  }
})

// @route  POST /auth/user/register
// @desc   Register a user and respond with JWT
// @access public
router.post('/register', async (req, res) => {
  // Validation check
  // Check if User exists
  const userCheck = await User.findOne({ email: req.body.email })
  if (userCheck) {
    errors.email = 'Email already in use'
    res.json({ error: errors })
    return
  }
  const { email, phone, password } = req.body
  try {
    // Create user
    const newUser = new User({
      username: email,
      email,
      phone,
      password,
      localId: true,
      created: Date.now(),
    })
    // Send verification email
    await newUser.save()
    return res.send({
      success: `An 'email verification' email has been sent to you. Please open the email and follow the provided instructions.`,
    })
  } catch (err) {
    return res.send(err.message)
  }
})

// @route  GET /auth/user/login
// @desc   Login a user and respond with JWT
// @access public
router.post('/login', async (req, res) => {
  // Validation check
  const errors = {}
  const { email, password } = req.body
  // Check if user with email registered
  const user = await User.findOne({ email })
  if (!user) {
    errors.email = 'Invalid username or password'
    res.json({ error: errors })
    return
  }
  // Check if users email verified
  if (!user.emailVerified) {
    res.json({
      error: { notVerified: 'Email address not yet verified' },
    })
    return
  }
  try {
    await user.comparePassword(password)
    const token = jwt.sign({ userId: user._id }, keys.JWT.secret)
    res.json({ token })
  } catch (err) {
    errors.password = 'Invalid username or password'
    res.json({ error: errors })
    return
  }
})

const signToken = (userID) => {
  return jwt.sign(
    {
      iss: 'NoobCoder',
      sub: userID,
    },
    'NoobCoder',
    { expiresIn: '1h' }
  )
}

// @route  POST /auth/user/login-web
// @desc   Login a user and respond with JWT
// @access public
router.post(
  '/login-web',
  passport.authenticate('local', { session: false }),
  (req, res) => {
    if (req.isAuthenticated()) {
      const { _id, username, role } = req.user
      const token = signToken(_id)
      res.cookie('access_token', token, { httpOnly: true, sameSite: true })
      res.status(200).json({ isAuthenticated: true, user: { username, role } })
    }
  }
)

// @route  POST /auth/user/reset-password
// @desc   Reset password
// @access public
router.post('/reset-password', async (req, res) => {
  const { username, phone, password } = req.body
  try {
    // Create a query object based on provided credentials
    const searchQuery = {}
    if (username) {
      searchQuery.username = username
    } else if (phone) {
      searchQuery.phone = phone
    } else {
      return res
        .status(400)
        .json({ error: 'Username or phone number is required' })
    }
    const user = await User.findOne(searchQuery)
    if (!user) {
      return res.json({ error: 'User not found' })
    }
    user.password = password
    user.passwordUpdated = false
    await user.save()
    res.json({ success: true, message: 'Password updated successfully' })
  } catch (err) {
    console.error('Password reset error:', err)
    res.status(500).json({ error: 'Server error during password reset' })
  }
})

// @route  POST /auth/user/update-password
// @desc   Update password
// @access public
router.post('/update-password', async (req, res) => {
  console.log(`at route:`, req.body)

  const { username, password } = req.body
  try {
    const user = await User.findOne({ username })
    console.log(`user at route:`, user)

    if (!user) {
      return res.json({ error: 'User not found' })
    }
    user.password = password
    user.passwordUpdated = true
    await user.save()
    res.json(user)
  } catch (err) {
    console.error('Password update error:', err)
    res.status(500).json({ error: 'Server error during password update' })
  }
})

module.exports = router
