const paymentService = require('../services/paymentService');

/**
 * Create topup order
 */
async function createTopupOrder(req, res) {
  try {
    const amount = parseFloat(req.body.amount);
    const result = await paymentService.createTopupOrder(req.customer.id, amount);
    res.json(result);
  } catch (error) {
    console.error('Error creating top-up order:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create top-up order'
    });
  }
}

/**
 * Verify topup payment
 */
async function verifyTopupPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const result = await paymentService.verifyTopupPayment(
      req.customer.id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );
    res.json(result);
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to verify payment'
    });
  }
}

/**
 * Mark failed payment
 */
async function markFailedPayment(req, res) {
  try {
    const { razorpay_order_id, error_reason } = req.body;
    const result = await paymentService.markFailedPayment(req.customer.id, razorpay_order_id, error_reason);
    res.json(result);
  } catch (error) {
    console.error('Error recording failed payment:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to record failed payment'
    });
  }
}

/**
 * Handle payment webhook
 */
async function handlePaymentWebhook(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const result = await paymentService.handlePaymentWebhook(req.body, signature);
    res.status(200).json(result);
  } catch (error) {
    console.error('[Payment Webhook] Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process webhook'
    });
  }
}

module.exports = {
  createTopupOrder,
  verifyTopupPayment,
  markFailedPayment,
  handlePaymentWebhook
};

