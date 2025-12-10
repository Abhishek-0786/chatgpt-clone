const chargingService = require('../services/chargingService');
const path = require('path');

/**
 * Start charging session
 * POST /api/user/charging/start (customer)
 * POST /api/cms/charging/start (CMS)
 */
async function startCharging(req, res) {
  try {
    const customerId = req.customer ? req.customer.id : null; // null for CMS
    const { deviceId, connectorId, amount, chargingPointId, vehicleId, idTag } = req.body;

    const result = await chargingService.startChargingSession({
      customerId,
      deviceId,
      connectorId,
      amount,
      chargingPointId,
      vehicleId,
      idTag
    });

    res.json(result);
  } catch (error) {
    console.error('Error starting charging session:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to start charging session'
    });
  }
}

/**
 * Stop charging session
 * POST /api/user/charging/stop (customer)
 * POST /api/cms/charging/stop (CMS)
 */
async function stopCharging(req, res) {
  try {
    const customerId = req.customer ? req.customer.id : null; // null for CMS
    const { deviceId, connectorId, transactionId, sessionId } = req.body;

    const result = await chargingService.stopChargingSession({
      customerId,
      deviceId,
      connectorId,
      transactionId,
      sessionId
    });

    res.json(result);
  } catch (error) {
    console.error('Error stopping charging session:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to stop charging session'
    });
  }
}

/**
 * Get active charging session
 * GET /api/user/charging/active-session (customer only)
 */
async function getActiveSession(req, res) {
  try {
    const customerId = req.customer.id;

    const session = await chargingService.getActiveSession(customerId);

    res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error('Error fetching active session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active session'
    });
  }
}

/**
 * Get sessions for customer
 * GET /api/user/sessions (customer only)
 */
async function getSessions(req, res) {
  try {
    const customerId = req.customer.id;
    const { fromDate, toDate, page, limit } = req.query;

    const filters = {
      fromDate: fromDate || null,
      toDate: toDate || null,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20
    };

    const result = await chargingService.getSessions(customerId, filters);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
}

/**
 * Get session by ID
 * GET /api/user/sessions/:sessionId (customer only)
 */
async function getSessionById(req, res) {
  try {
    const customerId = req.customer.id;
    const { sessionId } = req.params;

    const session = await chargingService.getSessionById(customerId, sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session'
    });
  }
}

/**
 * Download invoice PDF for completed charging session
 * GET /cms/charging-sessions/:sessionId/invoice/pdf
 * Query param ?preview=1 opens PDF inline in browser, otherwise downloads as attachment
 */
async function downloadInvoicePDF(req, res) {
  try {
    const { sessionId } = req.params;
    const isPreview = req.query.preview === '1';
    const PDFDocument = require('pdfkit');
    const invoice = await chargingService.getCompletedSessionInvoiceData(sessionId);
    
    if (!invoice) {
      return res.status(404).send('Session not found or not completed');
    }

    // Set response headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      isPreview
        ? `inline; filename=invoice_${sessionId}.pdf`
        : `attachment; filename=invoice_${sessionId}.pdf`
    );

    // Create PDF document
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    // Pipe PDF directly to response (no file storage)
    doc.pipe(res);

    // Build invoice PDF
    buildInvoicePDF(doc, invoice);

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice',
      message: error.message
    });
  }
}

// Logo file path
const LOGO_PATH = path.join(__dirname, '../public/user-panel/images/organization-logos/massive-black.png');

// Footer icon paths
const FOOTER_DIR = path.join(__dirname, '../public/images/footer');
const SOCIAL_DIR = path.join(__dirname, '../public/images/social');

function money(v) {
  if (v === null || v === undefined || v === '') return '0.00';
  return Number(v).toFixed(2);
}

function safeText(v) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function clamp(doc, text, width) {
  const str = safeText(text);
  if (doc.widthOfString(str) <= width) return str;
  let out = str;
  while (out.length > 3 && doc.widthOfString(out + '...') > width) {
    out = out.slice(0, -1);
  }
  return out + '...';
}

function drawEmailWebsiteOnCurve(doc, W, y) {
  const iconSize = 20;
  const gapBetweenBlocks = 16;
  const emailText = 'info@massivemobility.in';
  const webText = 'www.massivemobility.in';

  doc.font('Helvetica').fontSize(12);

  const emailTextW = doc.widthOfString(emailText);
  const webTextW = doc.widthOfString(webText);

  const totalW =
    iconSize + 6 + emailTextW +
    gapBetweenBlocks +
    iconSize + 6 + webTextW;

  let x = (W - totalW) / 2;

  // Email icon + text
  try {
    doc.image(path.join(FOOTER_DIR, 'email.png'), x, y - 5, {
      width: iconSize,
      height: iconSize
    });
  } catch (e) {
    // ignore if missing
  }
  x += iconSize + 6;
  doc.fillColor('#FFFFFF').text(emailText, x, y - 1);
  x += emailTextW + gapBetweenBlocks;

  // Web icon + text
  try {
    doc.image(path.join(FOOTER_DIR, 'web.png'), x, y - 5, {
      width: iconSize,
      height: iconSize
    });
  } catch (e) {
    // ignore if missing
  }
  x += iconSize + 6;
  doc.fillColor('#FFFFFF').text(webText, x, y - 1);
}

function drawSocialIconsOnCurve(doc, W, y) {
  const icons = [
    { file: 'facebook.png', url: 'https://www.facebook.com/massivemobility' },
    { file: 'instagram.png', url: 'https://www.instagram.com/massivemobility/' },
    { file: 'linkedin.png', url: 'https://in.linkedin.com/company/massivemobility' },
    { file: 'x.png', url: 'https://x.com/MassiveMobility' }
  ];

  const size = 20;
  const gap = 10;
  const totalW = icons.length * size + (icons.length - 1) * gap;

  let x = (W - totalW) / 2;

  icons.forEach((ic) => {
    const p = path.join(SOCIAL_DIR, ic.file);
    try {
      doc.image(p, x, y, { width: size, height: size });
      // clickable icons (optional)
      doc.link(x, y, size, size, ic.url);
    } catch (e) {
      // ignore if missing
    }
    x += size + gap;
  });
}

function drawFooterOnCurve(doc, W, H) {
  // IMPORTANT: These Y values MUST fall inside the blue wave area.
  // Adjust slightly if needed based on your wave height.
  const footerBaseY = H - 80;     // main anchor inside blue curve
  const textLineY = footerBaseY - 10;
  const socialLineY = footerBaseY + 30;

  drawEmailWebsiteOnCurve(doc, W, textLineY);
  drawSocialIconsOnCurve(doc, W, socialLineY);
}

function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${year}${month}${day}-${randomStr}`;
}

/**
 * Helper function to build invoice PDF content with premium wave template styling
 */
function buildInvoicePDF(doc, invoice) {
  const W = doc.page.width;   // ~595
  const H = doc.page.height;  // ~842
  const m = 40;

  const primary = '#1E3A8A';
  const dark = '#0F172A';
  const light = '#F8FAFC';
  const gray = '#6B7280';

  // ===== TOP WAVE HEADER =====
  doc.save();
  doc.fillColor(primary);
  doc.moveTo(0, 0);
  doc.lineTo(W, 0);
  doc.lineTo(W, 160);
  doc.bezierCurveTo(W * 0.75, 110, W * 0.55, 200, W * 0.25, 150);
  doc.bezierCurveTo(W * 0.10, 125, W * 0.05, 120, 0, 135);
  doc.closePath().fill();
  doc.restore();

  // Dark overlay curve (like layered wave)
  doc.save();
  doc.fillColor(dark);
  doc.moveTo(0, 0);
  doc.lineTo(W, 0);
  doc.lineTo(W, 95);
  doc.bezierCurveTo(W * 0.80, 70, W * 0.60, 120, W * 0.30, 90);
  doc.bezierCurveTo(W * 0.12, 75, W * 0.06, 70, 0, 80);
  doc.closePath().fillOpacity(0.9).fill();
  doc.restore();

  // ===== LOGO BADGE (TOP RIGHT CIRCLE) =====
  const badgeR = 52;
  const badgeCX = W - 110;
  const badgeCY = 78;

  doc.save();
  doc.circle(badgeCX, badgeCY, badgeR).fill('#FFFFFF');
  doc.circle(badgeCX, badgeCY, badgeR).lineWidth(3).stroke(primary);

  try {
    doc.image(LOGO_PATH, badgeCX - 30, badgeCY - 30, {
      fit: [60, 60],
      align: 'center',
      valign: 'center'
    });
  } catch (e) {
    // ignore if missing
  }
  doc.restore();

  // ===== HEADER TEXT (LEFT) =====
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24);
  doc.text('Massive Mobility', m, 24);

  doc.font('Helvetica').fontSize(10);
  doc.text('EV Charging Services', m, 56);

  // ===== INVOICE META (LEFT UNDER HEADER) =====
  let y = 185;
  const invoiceNumber = generateInvoiceNumber();
  doc.fillColor(dark).font('Helvetica-Bold').fontSize(10);
  doc.text('INVOICE NO:', m, y);
  doc.font('Helvetica').text(invoiceNumber, m + 90, y);

  y += 16;
  doc.font('Helvetica-Bold').text('DATE:', m, y);
  doc.font('Helvetica').text(safeText(invoice.startTime), m + 90, y);

  y += 16;
  doc.font('Helvetica-Bold').text('GENERATED TIME:', m, y);
  doc.font('Helvetica').text(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }), m + 100, y);

  // ===== TO / BILL TO (LEFT BLOCK) =====
  y += 40;
  doc.font('Helvetica-Bold').fontSize(11).text('BILL TO:', m, y);
  y += 16;
  doc.font('Helvetica').fontSize(10);
  doc.text(`Name: ${clamp(doc, invoice.customerName, 220)}`, m, y, { width: 220 });
  y += 14;
  doc.text(`Contact: ${safeText(invoice.customerContact)}`, m, y, { width: 220 });
  y += 14;
  doc.text(`Email: ${safeText(invoice.customerEmail)}`, m, y, { width: 220 });

  // ===== STATION BLOCK (RIGHT) =====
  const rightX = W - m - 250;
  let ry = 250;

  doc.roundedRect(rightX, ry, 250, 80, 8).fill(light);
  doc.fillColor(dark).font('Helvetica-Bold').fontSize(11);
  doc.text('CHARGING STATION', rightX + 12, ry + 10);

  doc.font('Helvetica').fontSize(10);
  doc.text(`Station: ${clamp(doc, invoice.stationName, 220)}`, rightX + 12, ry + 30, { width: 220 });
  doc.text(`Charger: ${clamp(doc, invoice.chargerNameOrDeviceId, 220)}`, rightX + 12, ry + 46, { width: 220 });

  // ===== SESSION DETAILS (CENTER, TWO COLS) =====
  y = 350;
  doc.fillColor(dark).font('Helvetica-Bold').fontSize(12).text('SESSION DETAILS', m, y);
  y += 20;

  const colGap = 30;
  const colW = (W - m * 2 - colGap) / 2;
  const col2X = m + colW + colGap;

  doc.font('Helvetica').fontSize(10).fillColor(dark);

  // left col
  doc.text(`Session ID: ${safeText(invoice.sessionId)}`, m, y, { width: colW });
  doc.text(`Transaction ID: ${safeText(invoice.transactionId)}`, m, y + 14, { width: colW });
  doc.text(`Start Time: ${safeText(invoice.startTime)}`, m, y + 28, { width: colW });
  doc.text(`Stop Time: ${safeText(invoice.stopTime)}`, m, y + 42, { width: colW });
  doc.text(`Duration: ${safeText(invoice.duration)}`, m, y + 56, { width: colW });

  // right col
  doc.text(`Vehicle: ${safeText(invoice.vehicleNumber)} ${invoice.vehicleModel ? '(' + invoice.vehicleModel + ')' : ''}`, col2X, y, { width: colW });
  doc.text(`Energy: ${safeText(invoice.energyKwh)} kWh`, col2X, y + 14, { width: colW });
  doc.text(`Payment Mode: ${safeText(invoice.paymentMode)}`, col2X, y + 28, { width: colW });
  doc.text(`Stop Reason: ${safeText(invoice.stopReason)}`, col2X, y + 42, { width: colW });

  // ===== BILLING TABLE =====
  y += 100;
  doc.fillColor(dark).font('Helvetica-Bold').fontSize(12).text('BILLING BREAKDOWN', m, y);
  y += 16;

  // header line
  doc.moveTo(m, y).lineTo(W - m, y).strokeColor('#D1D5DB').stroke();
  y += 10;

  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('DESCRIPTION', m, y);
  doc.text('AMOUNT (INR)', W - m - 120, y, { width: 120, align: 'right' });

  y += 14;
  doc.moveTo(m, y).lineTo(W - m, y).strokeColor('#E5E7EB').stroke();
  y += 10;

  doc.font('Helvetica').fontSize(10).fillColor(dark);

  function tRow(label, value, bold = false) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, m, y, { width: 300 });
    doc.text(`Rs ${money(value)}`, W - m - 120, y, { width: 120, align: 'right' });
    y += 16;
  }

  tRow('Base Charge', invoice.baseCharge);
  tRow(`Tax (${invoice.taxPercent || 0}%)`, invoice.taxAmount);
  tRow('Total Billed', invoice.billedAmount, true);
  tRow('Refund', invoice.refundAmount);

  y += 6;
  doc.moveTo(m, y).lineTo(W - m, y).strokeColor('#E5E7EB').stroke();
  y += 12;

  // Show total pay as the billed amount
  doc.font('Helvetica-Bold').fontSize(11);
  doc.text('TOTAL PAY', W - m - 200, y);
  doc.text(`Rs ${money(invoice.billedAmount || 0)}`, W - m - 120, y, { width: 120, align: 'right' });

  // ===== BOTTOM WAVE FOOTER =====
  doc.save();
  doc.fillColor(primary);
  doc.moveTo(0, H);
  doc.lineTo(W, H);
  doc.lineTo(W, H - 120);
  doc.bezierCurveTo(W * 0.75, H - 75, W * 0.55, H - 155, W * 0.25, H - 105);
  doc.bezierCurveTo(W * 0.10, H - 85, W * 0.05, H - 80, 0, H - 95);
  doc.closePath().fill();
  doc.restore();

  // Place email+website+social INSIDE the blue curve
  drawFooterOnCurve(doc, W, H);

  doc.fillColor(gray).font('Helvetica').fontSize(9);
  doc.text('Thank you for charging with Massive Mobility', m, H - 145, { align: 'center', width: W - m * 2 });
}

module.exports = {
  startCharging,
  stopCharging,
  getActiveSession,
  getSessions,
  getSessionById,
  downloadInvoicePDF
};

