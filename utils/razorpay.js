const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/**
 * Create a Razorpay order for wallet top-up
 * @param {Number} amount - Amount in INR (in paise, so multiply by 100)
 * @param {String} customerId - Customer ID for reference
 * @returns {Promise<Object>} Razorpay order object
 */
async function createOrder(amount, customerId) {
  try {
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: `wallet_topup_${customerId}_${Date.now()}`,
      notes: {
        customerId: customerId.toString(),
        type: 'wallet_topup'
      }
    };

    const order = await razorpay.orders.create(options);
    return {
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        createdAt: order.created_at
      }
    };
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create payment order'
    };
  }
}

/**
 * Verify Razorpay payment signature
 * @param {String} razorpayOrderId - Razorpay order ID
 * @param {String} razorpayPaymentId - Razorpay payment ID
 * @param {String} razorpaySignature - Razorpay signature
 * @returns {Boolean} True if signature is valid
 */
function verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    return generatedSignature === razorpaySignature;
  } catch (error) {
    console.error('Payment verification error:', error);
    return false;
  }
}

/**
 * Fetch payment details from Razorpay
 * @param {String} paymentId - Razorpay payment ID
 * @returns {Promise<Object>} Payment details
 */
async function getPaymentDetails(paymentId) {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return {
      success: true,
      payment: {
        id: payment.id,
        amount: payment.amount / 100, // Convert from paise to INR
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        orderId: payment.order_id,
        createdAt: payment.created_at
      }
    };
  } catch (error) {
    console.error('Error fetching payment details:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch payment details'
    };
  }
}

module.exports = {
  razorpay,
  createOrder,
  verifyPayment,
  getPaymentDetails
};

