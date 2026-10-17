// ============================================================================
// ERP LOCAL ENGINE - HTTP SERVER & API DISPATCHER (server.js)
// Port: 8069
// 100% Native Node.js HTTP Server - Zero Cloud Fees
// ============================================================================

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { registry } = require('./core/orm');
const { db } = require('./core/db');

const PORT = 8069;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('Invalid JSON Body'));
            }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8069'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }

    try {
        // --------------------------------------------------------------------
        // API ROUTES
        // --------------------------------------------------------------------
        if (pathname.startsWith('/api/')) {
            // 1. Partners
            if (pathname === '/api/partners' && method === 'GET') {
                const is_cust = parsedUrl.searchParams.get('is_customer');
                const is_supp = parsedUrl.searchParams.get('is_supplier');
                const domain = {};
                if (is_cust !== null) domain.is_customer = is_cust === '1';
                if (is_supp !== null) domain.is_supplier = is_supp === '1';
                const data = registry.env('res.partner').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/partners' && method === 'POST') {
                const body = await parseBody(req);
                const id = registry.env('res.partner').create(body);
                return sendJson(res, 201, { success: true, id });
            }

            // 1.1 Master Satuan (UoM)
            if (pathname === '/api/uoms' && method === 'GET') {
                const data = db.prepare('SELECT * FROM uom_uom ORDER BY id ASC').all();
                return sendJson(res, 200, { success: true, data });
            }

            // 2. Products (Master Item Gudang)
            if (pathname === '/api/products' && method === 'GET') {
                const category = parsedUrl.searchParams.get('category');
                const domain = {};
                if (category) domain.category = category;
                const data = registry.env('product.template').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/products' && method === 'POST') {
                const body = await parseBody(req);
                if (!body.name) {
                    return sendJson(res, 400, { success: false, error: 'Nama produk wajib diisi' });
                }
                const newId = registry.env('product.template').create(body);
                const item = registry.env('product.template').browse(newId);
                return sendJson(res, 201, { success: true, message: 'Item gudang baru berhasil ditambahkan', data: item, id: newId });
            }

            // 2.1 Product Detail & Edit
            const prodDetailMatch = pathname.match(/^\/api\/products\/(\d+)$/);
            if (prodDetailMatch && method === 'GET') {
                const id = parseInt(prodDetailMatch[1], 10);
                const data = registry.env('product.template').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Item gudang tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            if (prodDetailMatch && (method === 'POST' || method === 'PUT')) {
                const id = parseInt(prodDetailMatch[1], 10);
                const body = await parseBody(req);
                const updated = registry.env('product.template').write(id, body);
                return sendJson(res, 200, { success: true, message: 'Data item gudang berhasil diperbarui', data: updated });
            }

            // 2.2 Product Catalog for A4 Print
            if (pathname === '/api/products/catalog' && method === 'GET') {
                const category = parsedUrl.searchParams.get('category');
                const products = registry.env('product.template').get_catalog_data(category);
                const company = registry.env('product.template').get_company_info();
                return sendJson(res, 200, { success: true, data: { products, company } });
            }

            // 3. Stock Quants (On Hand Inventory)
            if (pathname === '/api/stock/quants' && method === 'GET') {
                const data = registry.env('stock.quant').get_on_hand();
                return sendJson(res, 200, { success: true, data });
            }

            // 4. Stock Pickings (Transfers: Inbound / Outbound / Internal)
            if (pathname === '/api/pickings' && method === 'GET') {
                const data = registry.env('stock.picking').search_read();
                return sendJson(res, 200, { success: true, data });
            }

            const pickPrintMatch = pathname.match(/^\/api\/pickings\/(\d+)\/print$/);
            if (pickPrintMatch && method === 'GET') {
                const id = parseInt(pickPrintMatch[1], 10);
                const result = registry.env('stock.picking').get_delivery_print_data(id);
                return sendJson(res, 200, result);
            }

            const pickDetailMatch = pathname.match(/^\/api\/pickings\/(\d+)$/);
            if (pickDetailMatch && method === 'GET') {
                const id = parseInt(pickDetailMatch[1], 10);
                const data = registry.env('stock.picking').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Picking tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            const pickValidateMatch = pathname.match(/^\/api\/pickings\/(\d+)\/validate$/);
            if (pickValidateMatch && method === 'POST') {
                const id = parseInt(pickValidateMatch[1], 10);
                const result = registry.env('stock.picking').action_validate(id);
                return sendJson(res, 200, result);
            }

            // 5. Purchases
            if (pathname === '/api/purchases' && method === 'GET') {
                const data = registry.env('purchase.order').search_read();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/purchases' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('purchase.order').create(body);
                return sendJson(res, 201, { success: true, data: result });
            }

            const poDetailMatch = pathname.match(/^\/api\/purchases\/(\d+)$/);
            if (poDetailMatch && method === 'GET') {
                const id = parseInt(poDetailMatch[1], 10);
                const data = registry.env('purchase.order').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'PO tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            const poConfirmMatch = pathname.match(/^\/api\/purchases\/(\d+)\/confirm$/);
            if (poConfirmMatch && method === 'POST') {
                const id = parseInt(poConfirmMatch[1], 10);
                const result = registry.env('purchase.order').action_confirm(id);
                return sendJson(res, 200, result);
            }

            const poCreateBillMatch = pathname.match(/^\/api\/purchases\/(\d+)\/create-bill$/);
            if (poCreateBillMatch && method === 'POST') {
                const id = parseInt(poCreateBillMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('purchase.order').action_create_bill(id, body);
                return sendJson(res, 200, result);
            }

            // 6. Sales
            if (pathname === '/api/sales' && method === 'GET') {
                const data = registry.env('sale.order').search_read();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/sales' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('sale.order').create(body);
                return sendJson(res, 201, { success: true, data: result });
            }

            const soDetailMatch = pathname.match(/^\/api\/sales\/(\d+)$/);
            if (soDetailMatch && method === 'GET') {
                const id = parseInt(soDetailMatch[1], 10);
                const data = registry.env('sale.order').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'SO tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            const soConfirmMatch = pathname.match(/^\/api\/sales\/(\d+)\/confirm$/);
            if (soConfirmMatch && method === 'POST') {
                const id = parseInt(soConfirmMatch[1], 10);
                const result = registry.env('sale.order').action_confirm(id);
                return sendJson(res, 200, result);
            }

            const soCreateInvoiceMatch = pathname.match(/^\/api\/sales\/(\d+)\/create-invoice$/);
            if (soCreateInvoiceMatch && method === 'POST') {
                const id = parseInt(soCreateInvoiceMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('sale.order').action_create_invoice(id, body);
                return sendJson(res, 200, result);
            }

            // 6.1 Marketing CRM (crm.lead)
            if (pathname === '/api/crm/leads' && method === 'GET') {
                const stage = parsedUrl.searchParams.get('stage') || parsedUrl.searchParams.get('filter');
                const campaign = parsedUrl.searchParams.get('campaign');
                const domain = {};
                if (stage && stage !== 'all') domain.stage = stage;
                if (campaign && campaign !== 'all') domain.campaign = campaign;
                const data = registry.env('crm.lead').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/crm/leads' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('crm.lead').create(body);
                return sendJson(res, 201, result);
            }

            if (pathname === '/api/crm/metrics' && method === 'GET') {
                const data = registry.env('crm.lead').get_metrics();
                return sendJson(res, 200, { success: true, data });
            }

            const crmLeadStageMatch = pathname.match(/^\/api\/crm\/leads\/(\d+)\/stage$/);
            if (crmLeadStageMatch && method === 'POST') {
                const id = parseInt(crmLeadStageMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('crm.lead').action_set_stage(id, body.stage, body.lost_reason);
                return sendJson(res, 200, result);
            }

            const crmLeadSoMatch = pathname.match(/^\/api\/crm\/leads\/(\d+)\/create-so$/);
            if (crmLeadSoMatch && method === 'POST') {
                const id = parseInt(crmLeadSoMatch[1], 10);
                const result = registry.env('crm.lead').action_create_quotation(id);
                return sendJson(res, 201, result);
            }

            const crmLeadDetailMatch = pathname.match(/^\/api\/crm\/leads\/(\d+)$/);
            if (crmLeadDetailMatch && method === 'GET') {
                const id = parseInt(crmLeadDetailMatch[1], 10);
                const data = registry.env('crm.lead').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Peluang CRM tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            if (crmLeadDetailMatch && (method === 'PUT' || method === 'POST')) {
                const id = parseInt(crmLeadDetailMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('crm.lead').write(id, body);
                return sendJson(res, 200, result);
            }

            // 7. Accounting: Chart of Accounts & Journals
            if (pathname === '/api/account/coa' && method === 'GET') {
                const data = registry.env('account.account').search_read();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/account/journals' && method === 'GET') {
                const data = registry.env('account.journal').search_read();
                return sendJson(res, 200, { success: true, data });
            }

            // 8. Accounting: Invoices, Bills & Journal Entries (account.move)
            if (pathname === '/api/account/moves' && method === 'GET') {
                const moveType = parsedUrl.searchParams.get('move_type');
                const state = parsedUrl.searchParams.get('state');
                const paymentState = parsedUrl.searchParams.get('payment_state');
                const domain = {};
                if (moveType) domain.move_type = moveType;
                if (state) domain.state = state;
                if (paymentState) domain.payment_state = paymentState;
                const data = registry.env('account.move').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            // Orders to Invoice Sub-menu
            if (pathname === '/api/account/orders-to-invoice' && method === 'GET') {
                const data = registry.env('account.move').get_orders_to_invoice();
                return sendJson(res, 200, { success: true, data });
            }

            const movePrintMatch = pathname.match(/^\/api\/account\/moves\/(\d+)\/print$/);
            if (movePrintMatch && method === 'GET') {
                const id = parseInt(movePrintMatch[1], 10);
                const result = registry.env('account.move').get_invoice_print_data(id);
                return sendJson(res, 200, result);
            }

            const moveUpdateMatch = pathname.match(/^\/api\/account\/moves\/(\d+)$/);
            if (moveUpdateMatch && method === 'PUT') {
                const id = parseInt(moveUpdateMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('account.move').update_draft_invoice(id, body);
                return sendJson(res, 200, result);
            }

            const moveDetailMatch = pathname.match(/^\/api\/account\/moves\/(\d+)$/);
            if (moveDetailMatch && method === 'GET') {
                const id = parseInt(moveDetailMatch[1], 10);
                const data = registry.env('account.move').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Dokumen akuntansi tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            const movePostMatch = pathname.match(/^\/api\/account\/moves\/(\d+)\/post$/);
            if (movePostMatch && method === 'POST') {
                const id = parseInt(movePostMatch[1], 10);
                const result = registry.env('account.move').action_post(id);
                return sendJson(res, 200, result);
            }

            const movePayMatch = pathname.match(/^\/api\/account\/moves\/(\d+)\/register-payment$/);
            if (movePayMatch && method === 'POST') {
                const id = parseInt(movePayMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('account.move').action_register_payment(id, body);
                return sendJson(res, 200, result);
            }

            const moveReverseMatch = pathname.match(/^\/api\/account\/moves\/(\d+)\/reverse$/);
            if (moveReverseMatch && method === 'POST') {
                const id = parseInt(moveReverseMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('account.move').action_reverse(id, body.reason);
                return sendJson(res, 200, result);
            }

            // Buat Entri Jurnal Manual
            if (pathname === '/api/account/entries' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('account.move').create_manual_entry(body);
                return sendJson(res, 201, result);
            }

            // Buat Faktur / Tagihan Langsung
            if (pathname === '/api/account/invoices' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('account.move').create_direct_invoice(body);
                return sendJson(res, 201, result);
            }

            // Digital Signature Endpoints
            if (pathname === '/api/sign' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('digital.signature').create(body);
                return sendJson(res, 201, { success: true, data: result });
            }

            const signGetMatch = pathname.match(/^\/api\/sign\/([a-zA-Z0-9_.]+)\/(\d+)$/);
            if (signGetMatch && method === 'GET') {
                const model = signGetMatch[1];
                const resId = parseInt(signGetMatch[2], 10);
                const data = registry.env('digital.signature').get_signatures(model, resId);
                return sendJson(res, 200, { success: true, data });
            }

            const signDeleteMatch = pathname.match(/^\/api\/sign\/(\d+)$/);
            if (signDeleteMatch && method === 'DELETE') {
                const id = parseInt(signDeleteMatch[1], 10);
                const result = registry.env('digital.signature').delete_signature(id);
                return sendJson(res, 200, result);
            }

            // Tambah Akun Baru di COA
            if (pathname === '/api/account/coa' && method === 'POST') {
                const body = await parseBody(req);
                const info = db.prepare(`
                    INSERT INTO account_account (code, name, type, reconcile)
                    VALUES (?, ?, ?, ?)
                `).run(body.code, body.name, body.type, body.reconcile ? 1 : 0);
                return sendJson(res, 201, { success: true, id: info.lastInsertRowid });
            }

            // Daftar Pajak
            if (pathname === '/api/account/taxes' && method === 'GET') {
                const data = registry.env('account.tax').search_read();
                return sendJson(res, 200, { success: true, data });
            }

            // 9. Accounting Reports: General Ledger, P&L, Trial Balance, Balance Sheet, Partner Ledger
            if (pathname === '/api/account/reports/general-ledger' && method === 'GET') {
                const data = registry.env('account.move').get_general_ledger();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/account/reports/profit-and-loss' && method === 'GET') {
                const data = registry.env('account.move').get_profit_and_loss();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/account/reports/trial-balance' && method === 'GET') {
                const data = registry.env('account.move').get_trial_balance();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/account/reports/balance-sheet' && method === 'GET') {
                const data = registry.env('account.move').get_balance_sheet();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/account/reports/cash-flow' && method === 'GET') {
                const dateFrom = parsedUrl.searchParams.get('date_from');
                const dateTo = parsedUrl.searchParams.get('date_to');
                const data = registry.env('account.move').get_cash_flow(dateFrom, dateTo);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/account/cash-transaction' && (method === 'POST' || method === 'PUT')) {
                const body = await parseBody(req);
                const result = registry.env('account.move').create_cash_transaction(body);
                return sendJson(res, 201, result);
            }

            if (pathname === '/api/account/reports/partner-ledger' && method === 'GET') {
                const data = registry.env('account.move').get_partner_ledger();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/account/reports/tax' && method === 'GET') {
                const data = registry.env('account.move').get_taxes_summary();
                return sendJson(res, 200, { success: true, data });
            }

            // Export General Ledger to CSV
            if (pathname === '/api/account/export/csv' && method === 'GET') {
                const csvData = registry.env('account.move').export_general_ledger_csv();
                res.writeHead(200, {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="Buku_Besar_ERP_Local.csv"',
                    'Access-Control-Allow-Origin': '*'
                });
                return res.end(csvData);
            }

            // 10. Stock Opname Mingguan API
            if (pathname === '/api/stock/opname' && method === 'GET') {
                const month = parsedUrl.searchParams.get('period_month');
                const week = parsedUrl.searchParams.get('week_number');
                const domain = {};
                if (month) domain.period_month = month;
                if (week) domain.week_number = parseInt(week, 10);
                const data = registry.env('stock.inventory').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/stock/opname' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('stock.inventory').create_opname(body);
                return sendJson(res, 201, result);
            }

            const opnameDetailMatch = pathname.match(/^\/api\/stock\/opname\/(\d+)$/);
            if (opnameDetailMatch && method === 'GET') {
                const id = parseInt(opnameDetailMatch[1], 10);
                const data = registry.env('stock.inventory').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Sesi opname tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            const opnameUpdateMatch = pathname.match(/^\/api\/stock\/opname\/(\d+)\/lines$/);
            if (opnameUpdateMatch && method === 'POST') {
                const id = parseInt(opnameUpdateMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('stock.inventory').update_lines(id, body.lines);
                return sendJson(res, 200, result);
            }

            const opnameValidateMatch = pathname.match(/^\/api\/stock\/opname\/(\d+)\/validate$/);
            if (opnameValidateMatch && method === 'POST') {
                const id = parseInt(opnameValidateMatch[1], 10);
                const result = registry.env('stock.inventory').action_validate(id);
                return sendJson(res, 200, result);
            }

            // 11. Pelaporan Nilai Stok & Tutup Buku Bulanan (Roll-over Awal/Akhir)
            if (pathname === '/api/stock/valuation/report' && method === 'GET') {
                const data = registry.env('stock.valuation').get_valuation_report();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/stock/valuation/monthly-close' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('stock.valuation').monthly_close(body.period_month, body.closing_date);
                return sendJson(res, 200, result);
            }

            // 12. Rekonsiliasi Akuntansi (Bank, Piutang, Hutang)
            if (pathname === '/api/account/reconciliation/overview' && method === 'GET') {
                const data = registry.env('account.reconciliation').get_overview();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/account/reconciliation/lines' && method === 'GET') {
                const accountId = parseInt(parsedUrl.searchParams.get('account_id'), 10);
                if (!accountId) return sendJson(res, 400, { success: false, error: 'account_id diperlukan' });
                const data = registry.env('account.reconciliation').get_unreconciled_lines(accountId);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/account/reconciliation/match' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('account.reconciliation').action_reconcile(body.line_ids, body.memo);
                return sendJson(res, 200, result);
            }

            if (pathname === '/api/account/reconciliation/auto-match' && method === 'POST') {
                const result = registry.env('account.reconciliation').action_auto_match();
                return sendJson(res, 200, result);
            }

            // 13. Chatter Post
            if (pathname === '/api/chatter/message' && method === 'POST') {
                const body = await parseBody(req);
                registry.env('mail.message').post_comment(body.model, body.res_id, body.body, body.author || 'Administrator');
                return sendJson(res, 200, { success: true });
            }

            // 11. Stats / KPI Dashboard
            if (pathname === '/api/stats' && method === 'GET') {
                const totalProducts = db.prepare('SELECT COUNT(*) as cnt FROM product_template WHERE active = 1').get().cnt;
                const totalVendors = db.prepare('SELECT COUNT(*) as cnt FROM res_partner WHERE is_supplier = 1').get().cnt;
                const totalCustomers = db.prepare('SELECT COUNT(*) as cnt FROM res_partner WHERE is_customer = 1').get().cnt;
                const pendingReceipts = db.prepare("SELECT COUNT(*) as cnt FROM stock_picking WHERE state != 'done' AND picking_type_id = (SELECT id FROM stock_picking_type WHERE code = 'incoming')").get().cnt;
                const pendingDeliveries = db.prepare("SELECT COUNT(*) as cnt FROM stock_picking WHERE state != 'done' AND picking_type_id = (SELECT id FROM stock_picking_type WHERE code = 'outgoing')").get().cnt;
                const totalStockValue = db.prepare(`
                    SELECT COALESCE(SUM(sq.quantity * p.standard_price), 0) as val
                    FROM stock_quant sq
                    JOIN product_template p ON sq.product_id = p.id
                    JOIN stock_location sl ON sq.location_id = sl.id
                    WHERE sl.usage = 'internal'
                `).get().val;

                // Accounting metrics
                const totalReceivable = db.prepare(`
                    SELECT COALESCE(SUM(amount_residual), 0) as val
                    FROM account_move WHERE move_type = 'out_invoice' AND state = 'posted'
                `).get().val;

                const totalPayable = db.prepare(`
                    SELECT COALESCE(SUM(amount_residual), 0) as val
                    FROM account_move WHERE move_type = 'in_invoice' AND state = 'posted'
                `).get().val;

                const pnl = registry.env('account.move').get_profit_and_loss();

                return sendJson(res, 200, {
                    success: true,
                    stats: {
                        totalProducts,
                        totalVendors,
                        totalCustomers,
                        pendingReceipts,
                        pendingDeliveries,
                        totalStockValue,
                        totalReceivable,
                        totalPayable,
                        netProfit: pnl.netProfit
                    }
                });
            }

            // 14. HR & PAYROLL API ENDPOINTS
            if (pathname === '/api/hr/stats' && method === 'GET') {
                const data = registry.env('hr.employee').get_kpis();
                return sendJson(res, 200, { success: true, stats: data });
            }

            // 14.1 Departments
            // 14.0 HR Stats & KPIs
            if (pathname === '/api/hr/stats' && method === 'GET') {
                const stats = registry.env('hr.employee').get_kpis();
                return sendJson(res, 200, { success: true, stats });
            }

            // 14.1 Departments
            if (pathname === '/api/hr/departments' && method === 'GET') {
                const data = registry.env('hr.department').search_read();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/departments' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('hr.department').create(body);
                return sendJson(res, 201, result);
            }

            const deptDetailMatch = pathname.match(/^\/api\/hr\/departments\/(\d+)$/);
            if (deptDetailMatch && (method === 'PUT' || method === 'POST')) {
                const id = parseInt(deptDetailMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.department').write(id, body);
                return sendJson(res, 200, result);
            }

            // 14.2 Jobs
            if (pathname === '/api/hr/jobs' && method === 'GET') {
                const data = registry.env('hr.job').search_read();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/jobs' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('hr.job').create(body);
                return sendJson(res, 201, result);
            }

            const jobDetailMatch = pathname.match(/^\/api\/hr\/jobs\/(\d+)$/);
            if (jobDetailMatch && method === 'GET') {
                const id = parseInt(jobDetailMatch[1], 10);
                const data = registry.env('hr.job').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Jabatan tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            if (jobDetailMatch && (method === 'PUT' || method === 'POST')) {
                const id = parseInt(jobDetailMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.job').write(id, body);
                return sendJson(res, 200, result);
            }

            // 14.3 Employees
            if (pathname === '/api/hr/employees' && method === 'GET') {
                const deptId = parsedUrl.searchParams.get('department_id');
                const status = parsedUrl.searchParams.get('status');
                const attStatus = parsedUrl.searchParams.get('attendance_status');
                const domain = {};
                if (deptId) domain.department_id = parseInt(deptId, 10);
                if (status) domain.status = status;
                if (attStatus) domain.attendance_status = attStatus;
                const data = registry.env('hr.employee').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/employees' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('hr.employee').create(body);
                return sendJson(res, 201, result);
            }

            const empDetailMatch = pathname.match(/^\/api\/hr\/employees\/(\d+)$/);
            if (empDetailMatch && method === 'GET') {
                const id = parseInt(empDetailMatch[1], 10);
                const data = registry.env('hr.employee').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Karyawan tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            if (empDetailMatch && (method === 'PUT' || method === 'POST')) {
                const id = parseInt(empDetailMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.employee').write(id, body);
                return sendJson(res, 200, result);
            }

            if (empDetailMatch && method === 'DELETE') {
                const id = parseInt(empDetailMatch[1], 10);
                const result = registry.env('hr.employee').unlink(id);
                return sendJson(res, 200, result);
            }

            // 14.4 Attendance
            if (pathname === '/api/hr/attendance' && method === 'GET') {
                const empId = parsedUrl.searchParams.get('employee_id');
                const date = parsedUrl.searchParams.get('date');
                const domain = {};
                if (empId) domain.employee_id = parseInt(empId, 10);
                if (date) domain.date = date;
                const data = registry.env('hr.attendance').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/attendance/today' && method === 'GET') {
                const data = registry.env('hr.attendance').get_today_summary();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/attendance' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('hr.attendance').create(body);
                return sendJson(res, 201, result);
            }

            if (pathname === '/api/hr/attendance/toggle' && (method === 'POST' || method === 'PUT')) {
                const body = await parseBody(req);
                if (!body.employee_id) return sendJson(res, 400, { success: false, error: 'employee_id diperlukan' });
                const result = registry.env('hr.attendance').action_check_in_out(parseInt(body.employee_id, 10), body.action_type);
                return sendJson(res, 200, result);
            }

            // 14.5 Leave Types & Leaves
            if (pathname === '/api/hr/leave-types' && method === 'GET') {
                const data = registry.env('hr.leave.type').search_read();
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/leaves' && method === 'GET') {
                const state = parsedUrl.searchParams.get('state');
                const empId = parsedUrl.searchParams.get('employee_id');
                const domain = {};
                if (state) domain.state = state;
                if (empId) domain.employee_id = parseInt(empId, 10);
                const data = registry.env('hr.leave').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/leaves' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('hr.leave').create(body);
                return sendJson(res, 201, result);
            }

            const leaveApproveMatch = pathname.match(/^\/api\/hr\/leaves\/(\d+)\/approve$/);
            if (leaveApproveMatch && (method === 'POST' || method === 'PUT')) {
                const id = parseInt(leaveApproveMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.leave').action_approve(id, body.validator || 'HR Administrator');
                return sendJson(res, 200, result);
            }

            const leaveRefuseMatch = pathname.match(/^\/api\/hr\/leaves\/(\d+)\/refuse$/);
            if (leaveRefuseMatch && (method === 'POST' || method === 'PUT')) {
                const id = parseInt(leaveRefuseMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.leave').action_refuse(id, body.reason || 'Kebutuhan operasional penting');
                return sendJson(res, 200, result);
            }

            // 14.6 Contracts
            if (pathname === '/api/hr/contracts' && method === 'GET') {
                const state = parsedUrl.searchParams.get('state');
                const domain = {};
                if (state) domain.state = state;
                const data = registry.env('hr.contract').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/contracts' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('hr.contract').create(body);
                return sendJson(res, 201, result);
            }

            const contractDetailMatch = pathname.match(/^\/api\/hr\/contracts\/(\d+)$/);
            if (contractDetailMatch && method === 'GET') {
                const id = parseInt(contractDetailMatch[1], 10);
                const data = registry.env('hr.contract').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Kontrak tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            if (contractDetailMatch && (method === 'PUT' || method === 'POST')) {
                const id = parseInt(contractDetailMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.contract').write(id, body);
                return sendJson(res, 200, result);
            }

            // 14.7 Payslips
            if (pathname === '/api/hr/payslips' && method === 'GET') {
                const period = parsedUrl.searchParams.get('period_month');
                const state = parsedUrl.searchParams.get('state');
                const domain = {};
                if (period) domain.period_month = period;
                if (state) domain.state = state;
                const data = registry.env('hr.payslip').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/payslips' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('hr.payslip').create(body);
                return sendJson(res, 201, result);
            }

            const payslipDetailMatch = pathname.match(/^\/api\/hr\/payslips\/(\d+)$/);
            if (payslipDetailMatch && method === 'GET') {
                const id = parseInt(payslipDetailMatch[1], 10);
                const data = registry.env('hr.payslip').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Slip gaji tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            const payslipComputeMatch = pathname.match(/^\/api\/hr\/payslips\/(\d+)\/compute$/);
            if (payslipComputeMatch && (method === 'POST' || method === 'PUT')) {
                const id = parseInt(payslipComputeMatch[1], 10);
                const result = registry.env('hr.payslip').compute_sheet(id);
                return sendJson(res, 200, result);
            }

            const payslipDoneMatch = pathname.match(/^\/api\/hr\/payslips\/(\d+)\/done$/);
            if (payslipDoneMatch && (method === 'POST' || method === 'PUT')) {
                const id = parseInt(payslipDoneMatch[1], 10);
                const result = registry.env('hr.payslip').action_payslip_done(id);
                return sendJson(res, 200, result);
            }

            const payslipPayMatch = pathname.match(/^\/api\/hr\/payslips\/(\d+)\/pay$/);
            if (payslipPayMatch && (method === 'POST' || method === 'PUT')) {
                const id = parseInt(payslipPayMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.payslip').action_pay_and_post_accounting(id, body.payment_mode || 'bank', body.lines);
                return sendJson(res, 200, result);
            }

            const payslipPrintMatch = pathname.match(/^\/api\/hr\/payslips\/(\d+)\/print$/);
            if (payslipPrintMatch && method === 'GET') {
                const id = parseInt(payslipPrintMatch[1], 10);
                const result = registry.env('hr.payslip').get_payslip_print_data(id);
                return sendJson(res, 200, result);
            }

            // 14.8 Applicants & Recruitment
            if (pathname === '/api/hr/applicants' && method === 'GET') {
                const stage = parsedUrl.searchParams.get('stage');
                const jobId = parsedUrl.searchParams.get('job_id');
                const domain = {};
                if (stage) domain.stage = stage;
                if (jobId) domain.job_id = parseInt(jobId, 10);
                const data = registry.env('hr.applicant').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/applicants' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('hr.applicant').create(body);
                return sendJson(res, 201, result);
            }

            const applicantDetailMatch = pathname.match(/^\/api\/hr\/applicants\/(\d+)$/);
            if (applicantDetailMatch && method === 'GET') {
                const id = parseInt(applicantDetailMatch[1], 10);
                const data = registry.env('hr.applicant').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Pelamar tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            if (applicantDetailMatch && (method === 'PUT' || method === 'POST')) {
                const id = parseInt(applicantDetailMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.applicant').write(id, body);
                return sendJson(res, 200, result);
            }

            if (applicantDetailMatch && method === 'DELETE') {
                const id = parseInt(applicantDetailMatch[1], 10);
                const result = registry.env('hr.applicant').unlink(id);
                return sendJson(res, 200, result);
            }

            const applicantStageMatch = pathname.match(/^\/api\/hr\/applicants\/(\d+)\/stage$/);
            if (applicantStageMatch && (method === 'PUT' || method === 'POST')) {
                const id = parseInt(applicantStageMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.applicant').action_set_stage(id, body.stage);
                return sendJson(res, 200, result);
            }

            const applicantHireMatch = pathname.match(/^\/api\/hr\/applicants\/(\d+)\/hire$/);
            if (applicantHireMatch && (method === 'POST' || method === 'PUT')) {
                const id = parseInt(applicantHireMatch[1], 10);
                const result = registry.env('hr.applicant').action_hire_employee(id);
                return sendJson(res, 200, result);
            }

            // 14.9 Expenses
            if (pathname === '/api/hr/expenses' && method === 'GET') {
                const state = parsedUrl.searchParams.get('state');
                const empId = parsedUrl.searchParams.get('employee_id');
                const domain = {};
                if (state) domain.state = state;
                if (empId) domain.employee_id = parseInt(empId, 10);
                const data = registry.env('hr.expense').search_read(domain);
                return sendJson(res, 200, { success: true, data });
            }

            if (pathname === '/api/hr/expenses' && method === 'POST') {
                const body = await parseBody(req);
                const result = registry.env('hr.expense').create(body);
                return sendJson(res, 201, result);
            }

            const expDetailMatch = pathname.match(/^\/api\/hr\/expenses\/(\d+)$/);
            if (expDetailMatch && method === 'GET') {
                const id = parseInt(expDetailMatch[1], 10);
                const data = registry.env('hr.expense').browse(id);
                if (!data) return sendJson(res, 404, { success: false, error: 'Klaim biaya tidak ditemukan' });
                return sendJson(res, 200, { success: true, data });
            }

            const expApproveMatch = pathname.match(/^\/api\/hr\/expenses\/(\d+)\/approve$/);
            if (expApproveMatch && (method === 'POST' || method === 'PUT')) {
                const id = parseInt(expApproveMatch[1], 10);
                const result = registry.env('hr.expense').action_approve(id);
                return sendJson(res, 200, result);
            }

            const expPayMatch = pathname.match(/^\/api\/hr\/expenses\/(\d+)\/pay$/);
            if (expPayMatch && (method === 'POST' || method === 'PUT')) {
                const id = parseInt(expPayMatch[1], 10);
                const body = await parseBody(req);
                const result = registry.env('hr.expense').action_pay(id, body.payment_mode || 'cash', body.lines);
                return sendJson(res, 200, result);
            }

            return sendJson(res, 404, { error: 'API endpoint not found' });
        }

        // --------------------------------------------------------------------
        // STATIC FILE SERVER
        // --------------------------------------------------------------------
        let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
        const extname = String(path.extname(filePath)).toLowerCase();

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // Fallback to index.html for SPA-like navigation
                    fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, content2) => {
                        if (err2) {
                            res.writeHead(404, { 'Content-Type': 'text/plain' });
                            return res.end('404 Not Found');
                        }
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(content2);
                    });
                } else {
                    res.writeHead(500);
                    res.end(`Server Error: ${err.code}`);
                }
            } else {
                res.writeHead(200, { 'Content-Type': MIME_TYPES[extname] || 'application/octet-stream' });
                res.end(content);
            }
        });

    } catch (err) {
        console.error('Server Error:', err);
        sendJson(res, 500, { success: false, error: err.message });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`================================================================`);
    console.log(`🚀 ERP Local Core Engine is running!`);
    console.log(`🌐 Local Web Client: http://localhost:${PORT}`);
    console.log(`📦 Port: ${PORT}`);
    console.log(`================================================================`);
});
