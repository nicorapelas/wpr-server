const express = require('express')
const router = express.Router()
const crypto = require('crypto')

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card')
const requireAuth = require('../../middlewares/requireAuth')

const PAYFAST_MERCHANT_ID = '10036574'
const PAYFAST_MERCHANT_KEY = 'jnpximwns54h1'
const PAYFAST_PASS_PHRASE = 'happychappy'
const FRONTEND_URL = keys.payfast.frontendUrl
const BACKEND_URL = keys.payfast.backendUrl
const PAYFAST_URL = 'https://sandbox.payfast.co.za/eng/process'

// Helper function for generating PayFast signature
function generateSignature(data, passPhrase = null) {
  try {
    // Remove signature if it exists
    const dataForSignature = { ...data }
    delete dataForSignature.signature

    // Convert to array and sort by key
    const sortedKeys = Object.keys(dataForSignature).sort()

    // Build parameter string exactly as PayFast does
    let pfOutput = ''
    sortedKeys.forEach((key, index) => {
      if (dataForSignature[key] !== '') {
        // Convert spaces to + and encode special characters
        const value = dataForSignature[key]
          .trim()
          .replace(/ /g, '+')
          .replace(/%20/g, '+')
          .replace(/[<>\"'&]/g, '')

        pfOutput += `${key}=${value}`
        if (index < sortedKeys.length - 1) {
          pfOutput += '&'
        }
      }
    })

    // Add passphrase if provided
    if (passPhrase !== null && passPhrase !== '') {
      pfOutput += `&passphrase=${passPhrase
        .trim()
        .replace(/ /g, '+')
        .replace(/%20/g, '+')
        .replace(/[<>\"'&]/g, '')}`
    }

    console.log('Raw data:', JSON.stringify(dataForSignature, null, 2))
    console.log('Final signature string:', pfOutput)

    // Generate MD5 hash without URL encoding
    const signature = crypto.createHash('md5').update(pfOutput).digest('hex')

    console.log('Generated signature:', signature)
    return signature
  } catch (error) {
    console.error('Error in generateSignature:', error)
    throw error
  }
}

// Create payment route
router.post('/create-payment', async (req, res) => {
  try {
    console.log('Request Body:', req.body)

    const paymentData = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,
      return_url: `${process.env.CLIENT_URL}/payment-success`,
      cancel_url: `${process.env.CLIENT_URL}/payment-cancelled`,
      notify_url: `${process.env.SERVER_URL}/payment/webhook`,
      name_first: 'Bob',
      name_last: 'Smith',
      email_address: 'testbuyer@example.com',
      m_payment_id: Date.now().toString(),
      amount: (req.body.amountInCents / 100).toFixed(2),
      item_name: 'Test Item 001',
      item_description: req.body.description,
      custom_str1: req.body.productCode,
    }

    console.log('Payment Data:', paymentData)

    // Return the payment data and URL
    res.json({
      success: true,
      paymentData,
      paymentUrl: process.env.PAYFAST_URL,
    })
  } catch (error) {
    console.error('Error creating payment:', error)
    res.status(500).json({ success: false, error: error.message })
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
