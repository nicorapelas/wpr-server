const express = require('express')
const cors = require('cors')

const root = require('../routes/root/root')
// Import authentication routes
const user = require('../routes/auth/local')
// Import api routes
const cards = require('../routes/api/cards')
const error = require('../routes/error/error')
// Import payment routes
const yoco = require('../routes/payment/yoco')
// const payfast = require('../routes/payment/payfast')

module.exports = (app) => {
  // Express middleware
  app.use(express.urlencoded({ extended: true }))
  app.use(express.json())
  app.use(cors())

  app.use('/', root)
  // Use authentication routes
  app.use('/auth/user', user)
  // Use api routes
  app.use('/cards', cards)
  app.use('/error', error)
  // Use payment routes
  app.use('/payment', yoco)
  //app.use('/payment', payfast)
}
