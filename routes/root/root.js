const express = require('express')
const mongoose = require('mongoose')
const User = mongoose.model('User')
const requireAuth = require('../../middlewares/requireAuth')
const { keys } = require('../../config/keys')

const router = express.Router()

router.get('/', async (req, res) => {
  res.json({ msg: 'server running...' })
})

router.get('/users-info', requireAuth, async (req, res) => {
  if (req.user.id !== keys.managment.id) {
    res.json({ error: 'Access denide' })
    return
  }
  const usersInfo = await User.find()
  res.json(usersInfo)
  return
})

module.exports = router


