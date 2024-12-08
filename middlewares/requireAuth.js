const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const User = mongoose.model('User')
const keys = require('../config/keys').keys

module.exports = (req, res, next) => {
  const { authorization } = req.headers
  if (!authorization) {
    res.json({ error: 'You must be logged in.' })
    return
  }
  const token = authorization.replace('Bearer ', '')
  jwt.verify(token, keys.JWT.secret, async (err, payload) => {
    if (err) {
      res.json({ error: 'You must be logged in.' })
      return
    }
    const { userId } = payload
    const user = await User.findById(userId)
    if (!user) {
      res.json({ error: 'no user logged in' })
      return
    }
    req.user = user
    next()
  })
}
