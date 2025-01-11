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
const PAYFAST_URL = 'https://sandbox.payfast.co.za/eng/process'

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

    const payfastModifiedAmount = (amountInCents / 100).toFixed(2)
    const paymentData = {
      // Use exact field structure as provided by PayFast
      merchant_id: '10036574',
      merchant_key: 'jnpximwns54h1',
      cancel_url: `${FRONTEND_URL}/payment-cancelled`,
      return_url: `${FRONTEND_URL}/payment-success`,
      notify_url: `${BACKEND_URL}/payment/webhook`,
      name_first: req.user.firstName || 'Unknown',
      name_last: req.user.lastName || 'Unknown',
      email_address: req.user.email,
      m_payment_id: Date.now().toString(),
      amount: payfastModifiedAmount,
      item_name: 'Test Item 001',
      item_description: description || 'Test Item 001 description',
      custom_str1: productCode,
      // Remove payment_method and other non-standard fields
    }

    // Generate signature
    const signature = generateSignature(paymentData, 'happychappy')
    paymentData.signature = signature

    // Instead of returning JSON, return HTML form
    const formFields = Object.entries(paymentData)
      .map(
        ([key, value]) => `<input type="hidden" name="${key}" value="${value}">`
      )
      .join('\n')

    const htmlForm = `
      <form id="payfast-form" action="${PAYFAST_URL}" method="post">
        ${formFields}
      </form>
      <script>document.getElementById('payfast-form').submit();</script>
    `

    res.send(htmlForm)
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
