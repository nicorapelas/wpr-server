const express = require('express')
const mongoose = require('mongoose')
const Error = mongoose.model('Error')
const requireAuth = require('../../middlewares/requireAuth')

const router = express.Router()

// @route  POST /error/
// @desc   Post error
// @access Private
router.post('/', requireAuth, async (req, res) => {
  const { error } = req.body
  try {
    const savedError = new Error({
      _user: req.user.id,
      savedError: error.message
    })
    await savedError.save()
    console.log(`savedError:`, savedError);
    res.json(savedError)
    return
  } catch (err) {
    console.log(err)
  }
})

module.exports = router
