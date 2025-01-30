const express = require('express')
const router = express.Router()
const axios = require('axios')
const mongoose = require('mongoose')

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card')
const CardOwed = require('../../models/CardOwed')
const User = mongoose.model('User')
const requireAuth = require('../../middlewares/requireAuth')

const YOCO_SECRET_KEY = keys.yoco.secretKey
const YOCO_API_URL = keys.yoco.apiUrl
const FRONTEND_URL = keys.yoco.frontendUrl
const BACKEND_URL = keys.yoco.backendUrl

console.log(`yoco public key`, keys.yoko.publicKey)

router.post('/create-payment', requireAuth, async (req, res) => {
  const { amountInCents, currency, description, productCode } = req.body

  try {
    const checkoutData = {
      amount: amountInCents,
      currency: currency,
      description: description,
      successUrl: `${FRONTEND_URL}/payment-success`,
      cancelUrl: `${FRONTEND_URL}/payment-cancelled?reason=user_back`,
      failureUrl: `${FRONTEND_URL}/payment-cancelled?reason=user_back`,
      successMessage:
        'Payment successful! You will be redirected automatically.',
      returnButton: {
        label: 'Return to Store',
        url: FRONTEND_URL,
      },
      mode: 'payment',
      payment_methods: ['card'],
      layout: {
        show_cancel: true,
        cancel_text: 'Cancel Payment',
        show_back: true,
        back_text: 'Go Back',
      },
      metadata: {
        order_id: Date.now().toString(),
        checkoutId: null,
        paymentFacilitator: 'yoco-online-checkout',
        description: description,
        productCode: productCode,
        _user: req.user._id,
      },
    }

    const response = await axios({
      method: 'post',
      url: `${YOCO_API_URL}checkouts`,
      headers: {
        Authorization: `Bearer ${YOCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      data: checkoutData,
    })

    await Payment.findOneAndUpdate(
      {
        _user: req.user,
        status: 'created',
        productCode,
        createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      {
        $set: {
          orderId: checkoutData.metadata.order_id,
          checkoutId: response.data.id,
          amount: checkoutData.amount,
          currency: checkoutData.currency,
          metadata: response.data.metadata,
        },
      },
      { new: true, upsert: true }
    )
    res.json(response.data)
  } catch (error) {
    console.error('Yoco Error:', error.response?.data || error.message)
    res.status(500).json({
      message: error.response?.data?.message || 'Payment failed',
    })
  }
})

// Add body-parser raw configuration to preserve raw body for webhook verification
router.use('/webhook', express.raw({ type: 'application/json' }))

router.post('/webhook', async (req, res) => {
  try {
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    if (!event.type || !event.payload) {
      return res.status(400).json({ error: 'Invalid webhook data structure' })
    }

    const { payload } = event
    const payment = await Payment.findOne({
      orderId: payload.metadata.order_id,
    })

    switch (event.type) {
      case 'payment.succeeded':
        if (payment) {
          payment.status = 'succeeded'
          payment.paymentId = payload.id
          payment.updatedAt = new Date()
          payment.metadata = {
            ...payment.metadata,
            paymentMethodDetails: {
              type: payload.paymentMethodDetails.type,
              last4: payload.paymentMethodDetails.card?.last4 || null,
            },
            completedAt: new Date(payload.createdDate),
          }
          await payment.save()

          let cardCount = 1
          switch (payment.productCode) {
            case 'WP002':
              cardCount = 5
              break
            case 'WP003':
              cardCount = 10
              break
          }

          const cards = await Card.find({ status: { $ne: 'sold' } })
            .limit(cardCount)
            .exec()

          if (cards.length < cardCount) {
            console.log(cards.length)
            console.log(cardCount)
            console.warn(
              `Insufficient cards available. Requested: ${cardCount}, Found: ${cards.length}`
            )
            await CardOwed.create({
              owedTo: payment._user,
              numberOfCards: cardCount,
            })
          }

          if (cards.length > 0) {
            const cardIds = cards.map((card) => card._id)
            await Card.updateMany(
              { _id: { $in: cardIds } },
              {
                status: 'sold',
                purchasedBy: payment._user,
                purchasedAt: new Date(),
              }
            )
          }
        } else {
          console.warn(
            `Payment record not found for order ID: ${payload.metadata.order_id}`
          )
        }
        break

      case 'payment.failed':
        if (payment) {
          payment.status = 'failed'
          payment.errorMessage = payload.failureReason || 'Payment failed'
          payment.updatedAt = new Date()
          await payment.save()
        }
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook Error:', error)
    res.status(200).json({ received: true, error: error.message })
  }
})

router.post('/fetch-purchase-history', requireAuth, async (req, res) => {
  try {
    const { ownerId } = req.body
    const payments = await Payment.find({ _user: ownerId })
    res.json(payments)
  } catch (error) {
    console.error('Error fetching purchase history:', error)
    res.status(500).json({
      message: 'Failed to fetch purchase history',
      error: error.message,
    })
  }
})

router.get('/fetch-all-payments', requireAuth, async (req, res) => {
  const payments = await Payment.find({})
  res.json(payments)
})

router.post('/fetch-user-of-payment', requireAuth, async (req, res) => {
  const { userId } = req.body
  const user = await User.findById(userId)
  res.json(user)
})

module.exports = router
