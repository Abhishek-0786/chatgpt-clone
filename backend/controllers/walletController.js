const walletService = require('../services/walletService');

/**
 * Get wallet balance
 */
async function getBalance(req, res) {
  try {
    const result = await walletService.getWalletBalance(req.customer.id);
    res.json(result);
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch wallet balance'
    });
  }
}

/**
 * Get wallet transactions
 */
async function getTransactions(req, res) {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      type: req.query.type
    };
    const result = await walletService.getWalletTransactions(req.customer.id, options);
    res.json(result);
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch wallet transactions'
    });
  }
}

/**
 * Debit wallet
 */
async function debit(req, res) {
  try {
    const { amount, description, referenceId } = req.body;
    const result = await walletService.debitWallet(req.customer.id, amount, description, referenceId);
    res.json(result);
  } catch (error) {
    console.error('Error debiting wallet:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to debit wallet'
    });
  }
}

module.exports = {
  getBalance,
  getTransactions,
  debit
};

