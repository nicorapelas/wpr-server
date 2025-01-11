const express = require('express')
const router = express.Router()
const crypto = require('crypto')

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card')
const requireAuth = require('../../middlewares/requireAuth')

const PAYFAST_MERCHANT_ID = keys.payfast.merchantId
const PAYFAST_MERCHANT_KEY = keys.payfast.merchantKey
const PAYFAST_PASS_PHRASE = keys.payfast.passPhrase
const FRONTEND_URL = keys.payfast.frontendUrl
const BACKEND_URL = keys.payfast.backendUrl

// Helper function for generating PayFast signature
function generateSignature(data, passPhrase = null) {
  // Remove signature if it exists
  if ('signature' in data) delete data.signature

  // Sort keys alphabetically
  const ordered = {}
  Object.keys(data)
    .sort()
    .forEach((key) => {
      ordered[key] = data[key]
    })

  // Add passphrase if provided
  if (passPhrase) {
    ordered.passphrase = passPhrase
  }

  // Create parameter string
  const signString = Object.entries(ordered)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value).trim())}`)
    .join('&')

  // Generate signature
  return crypto.createHash('md5').update(signString).digest('hex')
}

// Create payment route
router.post('/create-payment', requireAuth, async (req, res) => {
  try {
    const { amountInCents, currency, productCode, description } = req.body
    console.log('Request Body:', req.body)
    console.log('PayFast Credentials:', {
      merchantId: PAYFAST_MERCHANT_ID,
      merchantKey: PAYFAST_MERCHANT_KEY,
      passPhrase: PAYFAST_PASS_PHRASE,
    })

    // Validate required fields
    if (!amountInCents || !currency || !productCode) {
      console.error('Missing required fields:', {
        amountInCents,
        currency,
        productCode,
      })
      return res.status(400).json({ message: 'Missing required fields' })
    }

    const payfastModifiedAmount = (amountInCents / 100).toFixed(2)
    const paymentData = {
      merchant_id: '10033543',
      merchant_key: '34xw0ot2cjz69',
      return_url: `${FRONTEND_URL}/payment-success`,
      cancel_url: `${FRONTEND_URL}/payment-cancelled`,
      notify_url: `${BACKEND_URL}/payment/webhook`,
      name_first: 'Bob',
      name_last: 'Smith',
      email_address: 'nicorapelas@gmail.com',
      m_payment_id: '12345678',
      amount: '100',
      item_name: 'Test Item',
      item_description: 'test item description',
      custom_str1: 'payer_side',
      testing: 'true',
    }

    console.log('Payment Data:', paymentData)

    // Generate signature
    const signature = generateSignature(paymentData, PAYFAST_PASS_PHRASE)
    console.log('Signature:', signature)
    paymentData.signature = signature

    try {
      // Create payment record
      await Payment.findOneAndUpdate(
        {
          _user: req.user._id,
          status: 'created',
          productCode,
          createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) },
        },
        {
          $set: {
            orderId: paymentData.m_payment_id,
            amount: amountInCents,
            currency,
            metadata: paymentData,
          },
        },
        { new: true, upsert: true }
      )
    } catch (dbError) {
      console.error('Database Error:', dbError)
      return res
        .status(500)
        .json({ message: 'Failed to create payment record' })
    }

    res.json({
      redirectUrl: 'https://www.payfast.co.za/eng/process',
      paymentData,
    })
  } catch (error) {
    console.error('Payfast Error Details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
    })

    res.status(500).json({
      message: 'Payment initialization failed',
      error: error.message,
      details: error.response?.data,
    })
  }
})

// Configure body-parser for webhook
router.use('/webhook', express.raw({ type: 'application/json' }))

router.post('/webhook', async (req, res) => {
  try {
    const pfData =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    if (!pfData.payment_status || !pfData.m_payment_id) {
      return res.status(400).json({ error: 'Invalid webhook data structure' })
    }

    const payment = await Payment.findOne({ orderId: pfData.m_payment_id })

    switch (pfData.payment_status) {
      case 'COMPLETE':
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
            console.warn(
              `Insufficient cards available. Requested: ${cardCount}, Found: ${cards.length}`
            )
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
            `Payment record not found for order ID: ${pfData.m_payment_id}`
          )
        }
        break

      case 'FAILED':
      case 'CANCELLED':
        if (payment) {
          payment.status = 'failed'
          payment.errorMessage = pfData.reason || 'Payment failed'
          payment.updatedAt = new Date()
          await payment.save()
        }
        break

      default:
        console.log(`Unhandled payment status: ${pfData.payment_status}`)
    }

    res.status(200).json({ received: true })
  } catch (error) {
    // Log error but still acknowledge receipt
    console.error('Webhook Error:', error)
    res.status(200).json({ received: true, error: error.message })
  }
})

// Fetch purchase history
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

module.exports = router
