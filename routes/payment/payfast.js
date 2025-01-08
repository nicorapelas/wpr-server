const express = require('express')
const router = express.Router()

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card')
const requireAuth = require('../../middlewares/requireAuth')

const PAYFAST_MERCHANT_ID = keys.payfast.merchantId
const PAYFAST_MERCHANT_KEY = keys.payfast.merchantKey

const FRONTEND_URL = 'https://www.watchlistpro.site/'
const BACKEND_URL = 'https://coups-1889de9f2619.herokuapp.com'

router.post('/create-payment', requireAuth, async (req, res) => {
  console.log(req.body)
  const { amountInCents, currency, productCode } = req.body
  try {
    // Validate required fields
    if (!amountInCents || !currency || !productCode) {
      console.error('Missing required fields:', {
        amountInCents,
        currency,
        productCode,
      })
      return res.status(400).json({
        message: 'Missing required fields',
      })
    }
    const payfastModifiedAmount = (amountInCents / 100).toFixed(2)
    const paymentData = {
      amount: payfastModifiedAmount,
      cancel_url: `${FRONTEND_URL}/payment-cancelled`,
      email_address: 'jacobscycles@gmail.com',
      item_name: 'Watchlist Pro Subscription',
      m_payment_id: Date.now().toString(),
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      name_first: req.user.firstName || 'Unknown',
      name_last: req.user.lastName || 'Unknown',
      notify_url: `${BACKEND_URL}/payment/webhook`,
      return_url: `${FRONTEND_URL}/payment-success`,
    }

    // Create payment record
    await Payment.findOneAndUpdate(
      {
        _user: req.user,
        status: 'created',
        productCode: productCode,
        createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      {
        $set: {
          orderId: paymentData.m_payment_id,
          amount: amountInCents,
          currency: currency,
          metadata: paymentData,
        },
      },
      { new: true, upsert: true }
    )
    res.json({
      redirectUrl: 'https://www.payfast.co.za/eng/process',
      paymentData,
    })
  } catch (error) {
    console.error('Payfast Error:', error.response?.data || error.message)
    res.status(500).json({
      message: error.response?.data?.message || 'Payment failed',
    })
  }
})

// Add body-parser raw configuration for webhook
router.use('/webhook', express.raw({ type: 'application/json' }))

router.post('/webhook', async (req, res) => {
  try {
    // Parse the raw body
    const pfData =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    // Verify payment data
    if (!pfData.payment_status || !pfData.m_payment_id) {
      return res.status(400).json({ error: 'Invalid webhook data structure' })
    }

    switch (pfData.payment_status) {
      case 'COMPLETE': {
        // Find the payment using m_payment_id
        const payment = await Payment.findOne({ orderId: pfData.m_payment_id })

        if (payment) {
          payment.status = 'succeeded'
          payment.paymentId = pfData.pf_payment_id
          payment.updatedAt = new Date()
          payment.metadata = {
            ...payment.metadata,
            paymentMethodDetails: {
              type: pfData.payment_method,
              last4: pfData.card_last_four || null,
            },
            completedAt: new Date(),
          }
          await payment.save()

          // Determine number of cards based on product code
          let cardCount

          switch (payment.productCode) {
            case 'WP002':
              cardCount = 5
              break
            case 'WP003':
              cardCount = 10
              break
            default: // WP001 and any other cases
              cardCount = 1
          }

          // Find and update multiple cards
          const cards = await Card.find({ status: { $ne: 'sold' } })
            .limit(cardCount)
            .exec()

          if (cards.length < cardCount) {
            console.warn(
              `Insufficient cards available. Requested: ${cardCount}, Found: ${cards.length}`
            )
          }
          // Update only the specific cards found
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
            `Payment record not found for order ID: ${pfData.m_payment_id}`
          )
        }
        break
      }
      case 'FAILED':
      case 'CANCELLED': {
        const payment = await Payment.findOne({ orderId: pfData.m_payment_id })

        if (payment) {
          payment.status = 'failed'
          payment.errorMessage = pfData.reason || 'Payment failed'
          payment.updatedAt = new Date()
          await payment.save()
        }
        break
      }
      default: {
        console.log(`Unhandled payment status: ${pfData.payment_status}`)
      }
    }

    // Always return 200 for webhooks
    res.status(200).json({ received: true })
  } catch (error) {
    // Still return 200 to acknowledge receipt
    res.status(200).json({ received: true, error: error.message })
  }
})

// Add the fetch purchase history endpoint
router.post('/fetch-purchase-history', requireAuth, async (req, res) => {
  const { ownerId } = req.body
  const payments = await Payment.find({ _user: ownerId })
  res.json(payments)
})

module.exports = router
