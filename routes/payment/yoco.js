const express = require('express')
const router = express.Router()
const axios = require('axios')
const { keys } = require('../../config/keys')

const YOCO_SECRET_KEY = keys.yoco.secretKey
const YOCO_API_URL = 'https://payments.yoco.com/api/'
const FRONTEND_URL = 'https://782d-105-245-112-38.ngrok-free.app'

router.post('/create-payment', async (req, res) => {
  try {
    const { amountInCents, currency, description } = req.body

    console.log('Success URL:', `${FRONTEND_URL}/payment-success`)
    console.log('Cancel URL:', `${FRONTEND_URL}/payment-cancelled`)

    const checkoutData = {
      amount: amountInCents,
      currency: currency,
      description: description,
      successUrl: `${FRONTEND_URL}/payment-success`,
      cancelUrl: `${FRONTEND_URL}/payment-cancelled`,
      failureUrl: `${FRONTEND_URL}/payment-cancelled`,
      successMessage: 'Payment successful! You will be redirected automatically.',
      returnButton: {
        label: 'Return to Store',
        url: FRONTEND_URL
      },
      mode: 'payment',
      payment_methods: ['card'],
      layout: {
        show_cancel: true,
        cancel_text: 'Cancel Payment'
      },
      metadata: {
        order_id: Date.now().toString(),
        checkoutId: null,
        paymentFacilitator: "yoco-online-checkout"
      }
    }

    console.log('Sending checkout data:', checkoutData)

    const response = await axios({
      method: 'post',
      url: `${YOCO_API_URL}checkouts`,
      headers: {
        'Authorization': `Bearer ${YOCO_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      data: checkoutData
    })

    console.log('Yoco Checkout Response:', JSON.stringify(response.data, null, 2))
    res.json(response.data)

  } catch (error) {
    console.error('Yoco Error:', error.response?.data || error.message)
    res.status(500).json({ 
      message: error.response?.data?.message || 'Payment failed'
    })
  }
})

// Add webhook handler for payment notifications
router.post('/webhook', async (req, res) => {
  const event = req.body
  console.log('Webhook received:', event)
  res.json({ received: true })
})

module.exports = router
