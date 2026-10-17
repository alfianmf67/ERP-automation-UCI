// ============================================================================
// ERP LOCAL CORE ENGINE - AUTOMATED VERIFICATION TEST (test_local.js)
// Menguji seluruh siklus bisnis end-to-end secara lokal:
// 1. Database Init & Master Data
// 2. Purchase Order Flow (Draft -> Confirm -> Inbound Picking)
// 3. Double-Entry Stock Move Validation (Vendors -> WH/Stock)
// 4. Stock Quant Balance Check
// 5. Sales Order Flow (Draft -> Confirm -> Outbound Delivery)
// 6. Delivery Move Validation (WH/Stock -> Customers)
// 7. Stock Quant Deducted Check
// 8. Chatter & Audit Trail Integrity
// ============================================================================

const assert = require('node:assert');
const { registry } = require('./core/orm');
const { db } = require('./core/db');

console.log('================================================================');
console.log('🧪 MEMULAI PENGUJIAN OTOMATIS ERP LOCAL CORE ENGINE');
console.log('================================================================');

async function runLocalVerification() {
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    }

    // ------------------------------------------------------------------------
    // TEST 1: MASTER DATA INTEGRITY
    // ------------------------------------------------------------------------
    test('1. Verifikasi Master Data Awal (Partner, UOM, Location, Product)', () => {
        const partners = registry.env('res.partner').search_read();
        assert.ok(partners.length >= 6, `Expected >= 6 partners, got ${partners.length}`);

        const products = registry.env('product.template').search_read();
        assert.ok(products.length >= 6, `Expected >= 6 products, got ${products.length}`);

        const locations = registry.env('stock.location').search_read();
        assert.ok(locations.length >= 5, `Expected >= 5 locations, got ${locations.length}`);

        const stockLoc = locations.find(l => l.complete_name === 'WH/Stock');
        assert.ok(stockLoc, 'Lokasi internal WH/Stock harus terdaftar');
    });

    // ------------------------------------------------------------------------
    // TEST 2: PURCHASE ORDER CREATION & CONFIRMATION
    // ------------------------------------------------------------------------
    let createdPo = null;
    let createdPickingIn = null;

    test('2. Membuat Purchase Order Baru (Draft RFQ)', () => {
        const vendor = db.prepare("SELECT id FROM res_partner WHERE is_supplier = 1 LIMIT 1").get();
        const prod1 = db.prepare("SELECT id, list_price, standard_price FROM product_template WHERE default_code = 'RM-TRG-01'").get();
        const prod2 = db.prepare("SELECT id, list_price, standard_price FROM product_template WHERE default_code = 'RM-GLA-02'").get();

        createdPo = registry.env('purchase.order').create({
            partner_id: vendor.id,
            notes: 'Uji Coba Pengadaan Lokal ERP',
            lines: [
                { product_id: prod1.id, product_qty: 100, price_unit: prod1.standard_price },
                { product_id: prod2.id, product_qty: 50, price_unit: prod2.standard_price }
            ]
        });

        assert.ok(createdPo.id, 'PO ID harus terbuat');
        assert.ok(createdPo.name.startsWith('PO'), `Nomor PO harus berawalan PO, got ${createdPo.name}`);

        const poRecord = registry.env('purchase.order').browse(createdPo.id);
        assert.strictEqual(poRecord.state, 'draft', 'Status awal harus draft');
        assert.strictEqual(poRecord.order_lines.length, 2, 'Harus memiliki 2 order lines');
    });

    test('3. Konfirmasi Purchase Order -> Auto-Generate Inbound Picking (WH/IN)', () => {
        const confirmResult = registry.env('purchase.order').action_confirm(createdPo.id);
        assert.ok(confirmResult.success, 'Konfirmasi PO harus berhasil');
        assert.ok(confirmResult.picking_name.startsWith('WH/IN/'), 'Nomor picking harus berawalan WH/IN/');

        createdPickingIn = confirmResult.picking_id;
        const picking = registry.env('stock.picking').browse(createdPickingIn);
        assert.strictEqual(picking.state, 'assigned', 'Status picking harus assigned (ready)');
        assert.strictEqual(picking.origin, createdPo.name, 'Origin picking harus sesuai dengan nomor PO');
        assert.strictEqual(picking.move_lines.length, 2, 'Harus memiliki 2 stock moves');
    });

    // ------------------------------------------------------------------------
    // TEST 3: DOUBLE-ENTRY VALIDATION (VENDOR -> WH/STOCK)
    // ------------------------------------------------------------------------
    test('4. Validasi Inbound Picking -> Eksekusi Double-Entry Stock ke WH/Stock', () => {
        const validateResult = registry.env('stock.picking').action_validate(createdPickingIn);
        assert.ok(validateResult.success, 'Validasi picking inbound harus berhasil');

        const pickingDone = registry.env('stock.picking').browse(createdPickingIn);
        assert.strictEqual(pickingDone.state, 'done', 'Status picking harus done');

        // Cek saldo stock quant fisik
        const quants = registry.env('stock.quant').get_on_hand();
        const teriguQuant = quants.find(q => q.default_code === 'RM-TRG-01' && q.location_name === 'WH/Stock');
        const gulaQuant = quants.find(q => q.default_code === 'RM-GLA-02' && q.location_name === 'WH/Stock');

        assert.ok(teriguQuant && teriguQuant.quantity >= 100, `Stok Terigu di WH/Stock minimal 100, actual: ${teriguQuant?.quantity}`);
        assert.ok(gulaQuant && gulaQuant.quantity >= 50, `Stok Gula di WH/Stock minimal 50, actual: ${gulaQuant?.quantity}`);

        // Cek PO qty_received terupdate otomatis
        const poUpdated = registry.env('purchase.order').browse(createdPo.id);
        assert.strictEqual(poUpdated.order_lines[0].qty_received, 100, 'qty_received line 1 harus 100');
        assert.strictEqual(poUpdated.order_lines[1].qty_received, 50, 'qty_received line 2 harus 50');
    });

    // ------------------------------------------------------------------------
    // TEST 4: SALES ORDER & DELIVERY OUTBOUND (WH/STOCK -> CUSTOMER)
    // ------------------------------------------------------------------------
    let createdSo = null;
    let createdPickingOut = null;

    test('5. Membuat Sales Order Baru (Draft Quotation)', () => {
        const customer = db.prepare("SELECT id FROM res_partner WHERE is_customer = 1 LIMIT 1").get();
        const prod1 = db.prepare("SELECT id, list_price FROM product_template WHERE default_code = 'RM-TRG-01'").get();

        createdSo = registry.env('sale.order').create({
            partner_id: customer.id,
            notes: 'Pengiriman Cepat Kafe Lokal',
            lines: [
                { product_id: prod1.id, product_uom_qty: 30, price_unit: prod1.list_price }
            ]
        });

        assert.ok(createdSo.id, 'SO ID harus terbuat');
        assert.ok(createdSo.name.startsWith('SO'), `Nomor SO harus berawalan SO, got ${createdSo.name}`);

        const soRecord = registry.env('sale.order').browse(createdSo.id);
        assert.strictEqual(soRecord.state, 'draft', 'Status awal harus draft');
    });

    test('6. Konfirmasi Sales Order -> Auto-Generate Delivery Outbound (WH/OUT)', () => {
        const confirmResult = registry.env('sale.order').action_confirm(createdSo.id);
        assert.ok(confirmResult.success, 'Konfirmasi SO harus berhasil');
        assert.ok(confirmResult.picking_name.startsWith('WH/OUT/'), 'Nomor picking harus berawalan WH/OUT/');

        createdPickingOut = confirmResult.picking_id;
        const picking = registry.env('stock.picking').browse(createdPickingOut);
        assert.strictEqual(picking.origin, createdSo.name, 'Origin picking harus sesuai dengan nomor SO');
    });

    test('7. Validasi Delivery Outbound -> Pengurangan Stok Real-Time dari WH/Stock', () => {
        const prevQuants = registry.env('stock.quant').get_on_hand();
        const prevTerigu = prevQuants.find(q => q.default_code === 'RM-TRG-01' && q.location_name === 'WH/Stock').quantity;

        const validateResult = registry.env('stock.picking').action_validate(createdPickingOut);
        assert.ok(validateResult.success, 'Validasi pengiriman harus berhasil');

        const newQuants = registry.env('stock.quant').get_on_hand();
        const newTerigu = newQuants.find(q => q.default_code === 'RM-TRG-01' && q.location_name === 'WH/Stock').quantity;

        assert.strictEqual(newTerigu, prevTerigu - 30, `Stok Terigu harus berkurang tepat 30. Dari ${prevTerigu} menjadi ${newTerigu}`);

        const soUpdated = registry.env('sale.order').browse(createdSo.id);
        assert.strictEqual(soUpdated.order_lines[0].qty_delivered, 30, 'qty_delivered SO line harus 30');
    });

    // ------------------------------------------------------------------------
    // TEST 5: CHATTER AUDIT LOG CHECK
    // ------------------------------------------------------------------------
    test('8. Integritas Chatter & Audit Trail (mail_message)', () => {
        const poChatter = db.prepare("SELECT * FROM mail_message WHERE model = 'purchase.order' AND res_id = ?").all(createdPo.id);
        assert.ok(poChatter.length >= 2, `PO harus memiliki minimal 2 log chatter, actual: ${poChatter.length}`);

        const pickingChatter = db.prepare("SELECT * FROM mail_message WHERE model = 'stock.picking' AND res_id = ?").all(createdPickingIn);
        assert.ok(pickingChatter.length >= 2, `Picking harus memiliki minimal 2 log chatter, actual: ${pickingChatter.length}`);
    });

    // ------------------------------------------------------------------------
    // TEST 6: AKUNTANSI INTEGRASI PURCHASE (VENDOR BILL & PAYMENT)
    // ------------------------------------------------------------------------
    let createdBill = null;

    test('9. Integrasi Purchase: Membuat Tagihan Pemasok (Vendor Bill) dari PO', () => {
        const billRes = registry.env('purchase.order').action_create_bill(createdPo.id);
        assert.ok(billRes.success, 'Pembuatan Vendor Bill harus berhasil');
        assert.ok(billRes.bill_name.startsWith('BILL/'), `Nomor tagihan harus berawalan BILL/, got ${billRes.bill_name}`);

        createdBill = registry.env('account.move').browse(billRes.bill_id);
        assert.strictEqual(createdBill.move_type, 'in_invoice', 'Tipe dokumen harus in_invoice');
        assert.strictEqual(createdBill.state, 'draft', 'Status awal tagihan harus draft');
        assert.strictEqual(createdBill.payment_state, 'not_paid', 'Status pembayaran harus not_paid');
        assert.strictEqual(createdBill.line_ids.length, 2, 'Harus memiliki 2 baris item jurnal (Debit HPP & Kredit Hutang)');
    });

    test('10. Validasi Double-Entry: Posting Tagihan Pemasok ke Buku Besar', () => {
        const postRes = registry.env('account.move').action_post(createdBill.id);
        assert.ok(postRes.success, 'Posting Vendor Bill harus berhasil');

        const postedBill = registry.env('account.move').browse(createdBill.id);
        assert.strictEqual(postedBill.state, 'posted', 'Status harus menjadi posted');

        // Cek keseimbangan debit kredit
        const sumDebit = postedBill.line_ids.reduce((a, b) => a + b.debit, 0);
        const sumCredit = postedBill.line_ids.reduce((a, b) => a + b.credit, 0);
        assert.strictEqual(sumDebit, sumCredit, `Debit (${sumDebit}) harus persis seimbang dengan Kredit (${sumCredit})`);
    });

    test('11. Pelunasan Hutang: Registrasi Pembayaran Tagihan via Bank Mandiri', () => {
        const bankJournal = db.prepare("SELECT id FROM account_journal WHERE code = 'BNK1'").get();
        const payRes = registry.env('account.move').action_register_payment(createdBill.id, {
            journal_id: bankJournal.id,
            amount: createdBill.amount_total
        });

        assert.ok(payRes.success, 'Pembayaran harus berhasil');
        assert.strictEqual(payRes.new_state, 'paid', 'Status pembayaran harus menjadi PAID (Lunas)');
        assert.strictEqual(payRes.amount_residual, 0, 'Sisa tagihan harus 0');

        const paidBill = registry.env('account.move').browse(createdBill.id);
        assert.strictEqual(paidBill.payment_state, 'paid');
        assert.strictEqual(paidBill.payments.length, 1, 'Harus mencatat 1 history pembayaran');
    });

    // ------------------------------------------------------------------------
    // TEST 7: AKUNTANSI INTEGRASI SALES (CUSTOMER INVOICE & PAYMENT)
    // ------------------------------------------------------------------------
    let createdInvoice = null;

    test('12. Integrasi Sales: Membuat Faktur Penjualan (Customer Invoice) dari SO', () => {
        const invRes = registry.env('sale.order').action_create_invoice(createdSo.id);
        assert.ok(invRes.success, 'Pembuatan Faktur Penjualan harus berhasil');
        assert.ok(invRes.invoice_name.startsWith('INV/'), `Nomor faktur harus berawalan INV/, got ${invRes.invoice_name}`);

        createdInvoice = registry.env('account.move').browse(invRes.invoice_id);
        assert.strictEqual(createdInvoice.move_type, 'out_invoice', 'Tipe dokumen harus out_invoice');
        assert.strictEqual(createdInvoice.state, 'draft', 'Status awal harus draft');
        assert.strictEqual(createdInvoice.line_ids.length, 2, 'Harus memiliki 2 baris item jurnal (Debit Piutang & Kredit Pendapatan)');
    });

    test('13. Validasi Double-Entry: Posting Faktur Penjualan ke Buku Besar', () => {
        const postRes = registry.env('account.move').action_post(createdInvoice.id);
        assert.ok(postRes.success, 'Posting Customer Invoice harus berhasil');

        const postedInv = registry.env('account.move').browse(createdInvoice.id);
        assert.strictEqual(postedInv.state, 'posted', 'Status harus menjadi posted');

        const sumDebit = postedInv.line_ids.reduce((a, b) => a + b.debit, 0);
        const sumCredit = postedInv.line_ids.reduce((a, b) => a + b.credit, 0);
        assert.strictEqual(sumDebit, sumCredit, `Debit (${sumDebit}) harus seimbang dengan Kredit (${sumCredit})`);
    });

    test('14. Penerimaan Pembayaran Pelanggan via Bank Mandiri (Invoice Lunas)', () => {
        const bankJournal = db.prepare("SELECT id FROM account_journal WHERE code = 'BNK1'").get();
        const payRes = registry.env('account.move').action_register_payment(createdInvoice.id, {
            journal_id: bankJournal.id,
            amount: createdInvoice.amount_total
        });

        assert.ok(payRes.success, 'Penerimaan pembayaran harus berhasil');
        assert.strictEqual(payRes.new_state, 'paid', 'Status invoice harus PAID');
        assert.strictEqual(payRes.amount_residual, 0, 'Sisa piutang harus 0');
    });

    // ------------------------------------------------------------------------
    // TEST 8: LAPORAN KEUANGAN (GENERAL LEDGER & LABA RUGI)
    // ------------------------------------------------------------------------
    test('15. Verifikasi Laporan Keuangan: Buku Besar (General Ledger) & Laba Rugi', () => {
        const gl = registry.env('account.move').get_general_ledger();
        assert.ok(gl.length >= 3, `Buku besar harus memiliki minimal 3 akun aktif, actual: ${gl.length}`);

        const pnl = registry.env('account.move').get_profit_and_loss();
        assert.ok(pnl.totalIncome > 0, `Total pendapatan harus > 0, actual: ${pnl.totalIncome}`);
        assert.ok(pnl.totalExpense > 0, `Total beban/HPP harus > 0, actual: ${pnl.totalExpense}`);
        console.log(`     -> Laporan Laba Rugi: Pendapatan Rp ${pnl.totalIncome.toLocaleString('id-ID')} | HPP Rp ${pnl.totalExpense.toLocaleString('id-ID')} | Laba Bersih Rp ${pnl.netProfit.toLocaleString('id-ID')}`);
    });

    // ------------------------------------------------------------------------
    // TEST 9: FITUR AKUNTANSI LANJUTAN (MANUAL ENTRY, REVERSAL, TRIAL BALANCE & BALANCE SHEET)
    // ------------------------------------------------------------------------
    let manualEntry = null;

    test('16. Entri Jurnal Manual (Multi-line Journal Entry dengan Validasi Seimbang)', () => {
        const miscJournal = db.prepare("SELECT id FROM account_journal WHERE code = 'MISC'").get();
        const listrikAcc = db.prepare("SELECT id FROM account_account WHERE code = '61200010'").get();
        const bymhdAcc = db.prepare("SELECT id FROM account_account WHERE code = '25110010'").get();

        manualEntry = registry.env('account.move').create_manual_entry({
            journal_id: miscJournal.id,
            ref: 'Akrual Tagihan Listrik & Air Pabrik',
            lines: [
                { account_id: listrikAcc.id, name: 'Beban Listrik Bulan Ini', debit: 500000, credit: 0 },
                { account_id: bymhdAcc.id, name: 'Hutang Biaya Listrik (BYMHD)', debit: 0, credit: 500000 }
            ]
        });

        assert.ok(manualEntry.success, 'Pembuatan entri jurnal manual harus berhasil');
        assert.ok(manualEntry.name.startsWith('MISC/'), `Nomor dokumen harus MISC/, got ${manualEntry.name}`);

        // Post the entry
        const postRes = registry.env('account.move').action_post(manualEntry.id);
        assert.ok(postRes.success, 'Posting jurnal manual harus berhasil');
    });

    test('17. Nota Kredit / Pembalik (Reversal / Credit Note Retur)', () => {
        const reverseRes = registry.env('account.move').action_reverse(createdInvoice.id, 'Retur sebagian barang pesanan');
        assert.ok(reverseRes.success, 'Pembuatan pembalik harus berhasil');
        assert.ok(reverseRes.refund_name.startsWith('RINV/'), `Nomor nota kredit harus RINV/, got ${reverseRes.refund_name}`);

        const refundDoc = registry.env('account.move').browse(reverseRes.refund_id);
        assert.strictEqual(refundDoc.move_type, 'out_refund', 'Tipe dokumen harus out_refund');
        assert.strictEqual(refundDoc.reversed_entry_id, createdInvoice.id, 'Harus terhubung ke invoice asli');

        // Pastikan debit dan kredit tertukar
        const origDebit = createdInvoice.line_ids.find(l => l.debit > 0);
        const hasReversedCredit = refundDoc.line_ids.some(l => l.credit === origDebit.debit);
        assert.ok(hasReversedCredit, 'Harus ada baris kredit pada nota kredit yang membalikkan debit invoice');
    });

    test('18. Neraca Saldo (Trial Balance: Keseimbangan Debit vs Kredit)', () => {
        const tb = registry.env('account.move').get_trial_balance();
        assert.ok(tb.rows.length >= 5, `Neraca saldo harus memiliki minimal 5 akun, actual: ${tb.rows.length}`);
        assert.ok(tb.isBalanced, `Neraca saldo harus seimbang! Debit (${tb.grandDebit}) == Kredit (${tb.grandCredit})`);
        console.log(`     -> Neraca Saldo: Total Debit Rp ${tb.grandDebit.toLocaleString('id-ID')} == Total Kredit Rp ${tb.grandCredit.toLocaleString('id-ID')} (SEIMBANG)`);
    });

    test('19. Neraca Keuangan (Balance Sheet: Total Aktiva == Total Pasiva + Ekuitas)', () => {
        const bs = registry.env('account.move').get_balance_sheet();
        assert.ok(bs.isBalanced, `Neraca Keuangan harus seimbang! Total Aset (${bs.totalAssets}) == Total Kewajiban + Ekuitas (${bs.totalLiabilitiesAndEquity})`);
        console.log(`     -> Neraca Keuangan: Total Aset Rp ${bs.totalAssets.toLocaleString('id-ID')} == Total Kewajiban & Ekuitas Rp ${bs.totalLiabilitiesAndEquity.toLocaleString('id-ID')} (SEIMBANG)`);
    });

    test('20. Ekspor Buku Besar ke Format CSV Standar Akuntansi', () => {
        const csv = registry.env('account.move').export_general_ledger_csv();
        assert.ok(csv.includes('Tanggal,Nomor Dokumen,Jurnal,Kode Akun'), 'Header CSV harus valid');
        const linesCount = csv.split('\n').length;
        assert.ok(linesCount >= 8, `Baris CSV harus memiliki minimal 8 transaksi, actual: ${linesCount}`);
        console.log(`     -> Ekspor CSV sukses: ${linesCount} baris data transaksi terangkum.`);
    });

    // ------------------------------------------------------------------------
    // TEST 10: FITUR AKUNTANSI DIRECT INVOICING, PPN 11% & COA CUSTOMIZATION
    // ------------------------------------------------------------------------
    let directInv = null;
    let directBill = null;

    test('21. Pembuatan Faktur Penjualan Langsung dengan Pajak PPN 11%', () => {
        const customer = db.prepare("SELECT id FROM res_partner WHERE is_customer = 1 LIMIT 1").get();
        const product = db.prepare("SELECT id, list_price FROM product_template LIMIT 1").get();

        directInv = registry.env('account.move').create_direct_invoice({
            move_type: 'out_invoice',
            partner_id: customer.id,
            ref: 'Faktur Penjualan Langsung - Layanan Konsultasi & Produk',
            lines: [
                { product_id: product.id, quantity: 10, price_unit: 100000, apply_ppn: true }
            ]
        });

        assert.ok(directInv.success, 'Pembuatan faktur langsung harus berhasil');
        assert.ok(directInv.name.startsWith('INV/'), `Nomor faktur harus berawalan INV/, got ${directInv.name}`);
        assert.strictEqual(directInv.tax_total, 110000, 'PPN 11% dari 1.000.000 harus tepat Rp 110.000');
        assert.strictEqual(directInv.amount_total, 1110000, 'Total harus Rp 1.110.000 (Subtotal + PPN)');

        // Validasi posting & double entry balance
        const postRes = registry.env('account.move').action_post(directInv.id);
        assert.ok(postRes.success, 'Posting faktur langsung harus berhasil');

        const postedDoc = registry.env('account.move').browse(directInv.id);
        const sumDebit = postedDoc.line_ids.reduce((a, b) => a + b.debit, 0);
        const sumCredit = postedDoc.line_ids.reduce((a, b) => a + b.credit, 0);
        assert.strictEqual(sumDebit, sumCredit, `Debit (${sumDebit}) harus seimbang dengan Kredit (${sumCredit})`);
    });

    test('22. Pembuatan Tagihan Vendor Langsung dengan Pajak PPN 11%', () => {
        const vendor = db.prepare("SELECT id FROM res_partner WHERE is_supplier = 1 LIMIT 1").get();
        const product = db.prepare("SELECT id, standard_price FROM product_template LIMIT 1").get();

        directBill = registry.env('account.move').create_direct_invoice({
            move_type: 'in_invoice',
            partner_id: vendor.id,
            ref: 'Pembelian Langsung Peralatan & Sparepart',
            lines: [
                { product_id: product.id, quantity: 5, price_unit: 200000, apply_ppn: true }
            ]
        });

        assert.ok(directBill.success, 'Pembuatan tagihan langsung harus berhasil');
        assert.ok(directBill.name.startsWith('BILL/'), `Nomor tagihan harus berawalan BILL/, got ${directBill.name}`);
        assert.strictEqual(directBill.tax_total, 110000, 'PPN 11% dari 1.000.000 harus tepat Rp 110.000');
        assert.strictEqual(directBill.amount_total, 1110000, 'Total harus Rp 1.110.000 (Subtotal + PPN)');

        const postRes = registry.env('account.move').action_post(directBill.id);
        assert.ok(postRes.success, 'Posting tagihan langsung harus berhasil');
    });

    test('23. Laporan Rekapitulasi Pajak PPN (SPT Masa PPN: PPN Keluaran vs PPN Masukan)', () => {
        const taxSummary = registry.env('account.move').get_taxes_summary();
        assert.ok(taxSummary.ppnKeluaran > 0, `PPN Keluaran harus > 0, actual: ${taxSummary.ppnKeluaran}`);
        assert.ok(taxSummary.ppnMasukan > 0, `PPN Masukan harus > 0, actual: ${taxSummary.ppnMasukan}`);
        assert.ok(taxSummary.lines.length >= 2, 'Harus mencatat minimal 2 baris mutasi pajak');
        console.log(`     -> Rekapitulasi Pajak: PPN Keluaran Rp ${taxSummary.ppnKeluaran.toLocaleString('id-ID')} | PPN Masukan Rp ${taxSummary.ppnMasukan.toLocaleString('id-ID')} | Status: ${taxSummary.status}`);
    });

    test('24. Penambahan Akun Baru ke Bagan Akun (COA Customization)', () => {
        const newCode = '11130001';
        const newName = 'Rekening Bank BCA Operasional';
        db.prepare('DELETE FROM account_account WHERE code = ?').run(newCode);

        const info = db.prepare(`
            INSERT INTO account_account (code, name, type, reconcile)
            VALUES (?, ?, 'asset_cash', 0)
        `).run(newCode, newName);

        assert.ok(info.lastInsertRowid > 0, 'ID akun baru harus valid');
        const checkAcc = db.prepare('SELECT * FROM account_account WHERE id = ?').get(info.lastInsertRowid);
        assert.strictEqual(checkAcc.code, newCode);
        assert.strictEqual(checkAcc.name, newName);
    });

    // ------------------------------------------------------------------------
    // TEST 25: STOCK OPNAME MINGGUAN (INVENTORY ADJUSTMENT & JURNAL SELISIH)
    // ------------------------------------------------------------------------
    let opnameSession = null;
    test('25. Stock Opname Mingguan: Hitung Fisik, Deteksi Selisih, Auto-Quant & Jurnal Selisih', () => {
        // Ambil salah satu produk bahan baku (e.g. Tepung Terigu)
        const tegangProd = db.prepare("SELECT * FROM product_template WHERE default_code = 'RM-TRG-01'").get();
        const initialQuant = db.prepare("SELECT quantity FROM stock_quant WHERE product_id = ?").get(tegangProd.id);
        const curQty = initialQuant ? initialQuant.quantity : 0;

        // Buat sesi opname minggu ke-2 bulan 2026-01
        // Simulasikan ada susut/rusak 2 Kg (counted_qty = curQty - 2)
        const targetCounted = Math.max(0, curQty - 2);
        const opRes = registry.env('stock.inventory').create_opname({
            period_month: '2026-01',
            week_number: 2,
            notes: 'Stock Opname Mingguan W02 - Pengujian Rutin Gudang Bahan Baku',
            lines: [
                { product_id: tegangProd.id, counted_qty: targetCounted }
            ]
        });

        assert.ok(opRes.success, 'Sesi opname harus berhasil dibuat');
        assert.ok(opRes.name.includes('W02'), `Nomor dokumen harus mencakup W02, got ${opRes.name}`);
        opnameSession = registry.env('stock.inventory').browse(opRes.id);
        assert.strictEqual(opnameSession.state, 'draft');

        // Validasi Opname -> Harus mengoreksi stock_quant dan membuat jurnal selisih
        const valRes = registry.env('stock.inventory').action_validate(opRes.id);
        assert.ok(valRes.success, 'Validasi opname harus sukses');

        // Periksa kuantitas quant terbaru
        const updatedQuant = db.prepare("SELECT quantity FROM stock_quant WHERE product_id = ?").get(tegangProd.id);
        assert.strictEqual(updatedQuant.quantity, targetCounted, 'Kuantitas quant harus sesuai hasil hitung fisik');

        // Periksa jurnal selisih yang terbentuk
        assert.ok(valRes.accounting_move_id, 'Harus membentuk jurnal penyesuaian selisih');
        const selisihMove = registry.env('account.move').browse(valRes.accounting_move_id);
        assert.strictEqual(selisihMove.state, 'posted');
        console.log(`     -> Opname ${opnameSession.name} divalidasi: Selisih ${opnameSession.total_variance_qty} Kg (Rp ${opnameSession.total_variance_value.toLocaleString('id-ID')}) -> Jurnal ${selisihMove.name}`);
    });

    // ------------------------------------------------------------------------
    // TEST 26: VALUASI STOK BULANAN & ROLL-OVER STOK AWAL / AKHIR OTOMATIS
    // ------------------------------------------------------------------------
    test('26. Valuasi Stok Bulanan: Jurnal Stok Akhir Bulan M & Jurnal Stok Awal Bulan M+1', () => {
        // Hapus closing periode 2026-01 jika ada
        db.prepare("DELETE FROM stock_period_closing WHERE period_month = '2026-01'").run();

        const reportBefore = registry.env('stock.valuation').get_valuation_report();
        assert.ok(reportBefore.totalStockValue > 0, `Total nilai stok harus > 0, actual: ${reportBefore.totalStockValue}`);

        // Lakukan Tutup Buku Stok Bulanan untuk Periode 2026-01
        const closeRes = registry.env('stock.valuation').monthly_close('2026-01', '2026-01-31');
        assert.ok(closeRes.success, 'Tutup buku stok bulanan harus berhasil');
        assert.strictEqual(closeRes.period_month, '2026-01');
        assert.strictEqual(closeRes.next_period_month, '2026-02');

        // Verifikasi Jurnal 1: Nilai Persediaan Akhir Periode 2026-01
        const closingMove = registry.env('account.move').browse(closeRes.closing_move_id);
        assert.ok(closingMove, 'Jurnal penutupan persediaan akhir harus ditemukan');
        assert.strictEqual(closingMove.state, 'posted');
        const persediaanDebit = closingMove.line_ids.find(l => l.account_code === '11300010');
        const persediaanAkhirCredit = closingMove.line_ids.find(l => l.account_code === '51000020');
        assert.ok(persediaanDebit && persediaanDebit.debit === closeRes.total_stock_value, 'Debit harus ke Persediaan Bahan Baku');
        assert.ok(persediaanAkhirCredit && persediaanAkhirCredit.credit === closeRes.total_stock_value, 'Kredit harus ke Persediaan Akhir');

        // Verifikasi Jurnal 2: Nilai Persediaan Awal Periode 2026-02 (Roll-over otomatis)
        const openingMove = registry.env('account.move').browse(closeRes.opening_move_id);
        assert.ok(openingMove, 'Jurnal persediaan awal bulan berikutnya harus ditemukan');
        assert.strictEqual(openingMove.state, 'posted');
        const persediaanAwalDebit = openingMove.line_ids.find(l => l.account_code === '51000015');
        const persediaanCredit = openingMove.line_ids.find(l => l.account_code === '11300010');
        assert.ok(persediaanAwalDebit && persediaanAwalDebit.debit === closeRes.total_stock_value, 'Debit harus ke Persediaan Awal');
        assert.ok(persediaanCredit && persediaanCredit.credit === closeRes.total_stock_value, 'Kredit harus ke Persediaan Bahan Baku');

        console.log(`     -> Tutup Buku 2026-01: Nilai Stok Rp ${closeRes.total_stock_value.toLocaleString('id-ID')}`);
        console.log(`        * Jurnal Stok Akhir 31 Jan: ${closingMove.name}`);
        console.log(`        * Jurnal Stok Awal  01 Feb: ${openingMove.name} (Roll-over Otomatis)`);
    });

    // ------------------------------------------------------------------------
    // TEST 27: REKONSILIASI AKUNTANSI (BANK, PIUTANG, HUTANG)
    // ------------------------------------------------------------------------
    test('27. Rekonsiliasi Akuntansi: Overview Akun, Deteksi Transaksi, dan Rekonsiliasi Otomatis', () => {
        // Ambil overview rekonsiliasi
        const overview = registry.env('account.reconciliation').get_overview();
        assert.ok(overview.length >= 2, 'Harus mencakup minimal akun Piutang Usaha dan Hutang Usaha');

        // Jalankan Auto-Match Rekonsiliasi
        const matchRes = registry.env('account.reconciliation').action_auto_match();
        assert.ok(matchRes.success, 'Auto-match rekonsiliasi harus berhasil dijalankan');
        console.log(`     -> Rekonsiliasi Akuntansi: ${matchRes.matched_pairs} pasangan transaksi berhasil direkonsiliasi otomatis.`);
    });

    // ------------------------------------------------------------------------
    // TEST 28: SUB MENU AKUNTANSI - PESANAN SIAP DITAGIH, EDIT DRAFT, POST, BAYAR & CETAK
    // ------------------------------------------------------------------------
    test('28. Akuntansi: Pesanan Siap Ditagih (Status Dalam Pengiriman / Terkirim) -> Buat & Edit Draft Invoice -> Konfirmasi -> Bayar & Cetak', () => {
        const customer = db.prepare("SELECT id FROM res_partner WHERE is_customer = 1 LIMIT 1").get();
        const prod = db.prepare("SELECT id, list_price, standard_price FROM product_template WHERE default_code = 'RM-TRG-01'").get();

        // 1. Buat Sales Order baru
        const so = registry.env('sale.order').create({
            partner_id: customer.id,
            notes: 'Pesanan Uji Siap Ditagih Flow',
            lines: [
                { product_id: prod.id, product_uom_qty: 12, price_unit: prod.list_price }
            ]
        });
        assert.ok(so.id, 'SO harus berhasil dibuat');

        // 2. Konfirmasi SO -> Menghasilkan pengiriman (WH/OUT) dengan status 'assigned' (Dalam Pengiriman)
        const confirmRes = registry.env('sale.order').action_confirm(so.id);
        assert.ok(confirmRes.success, 'SO berhasil dikonfirmasi');

        // 3. Cek get_orders_to_invoice() -> SO ini harus muncul dengan delivery_state = 'assigned' dan invoice_id = null
        let ordersToInv = registry.env('account.move').get_orders_to_invoice();
        let targetOrder = ordersToInv.find(o => o.so_id === so.id);
        assert.ok(targetOrder, 'SO yang baru dikonfirmasi harus muncul di daftar Pesanan Siap Ditagih');
        assert.strictEqual(targetOrder.delivery_state, 'assigned', 'Status pengiriman awal harus assigned');
        assert.strictEqual(targetOrder.invoice_id, null, 'Belum memiliki invoice');

        // 4. Buat Draft Invoice
        const invRes = registry.env('sale.order').action_create_invoice(so.id);
        assert.ok(invRes.success, 'Pembuatan invoice harus berhasil');
        const invId = invRes.invoice_id;

        // 5. Cek lagi get_orders_to_invoice() -> Sekarang invoice_state = 'draft'
        ordersToInv = registry.env('account.move').get_orders_to_invoice();
        targetOrder = ordersToInv.find(o => o.so_id === so.id);
        assert.strictEqual(targetOrder.invoice_id, invId, 'Invoice ID harus terhubung');
        assert.strictEqual(targetOrder.invoice_state, 'draft', 'Status invoice harus draft');

        // 6. Edit Isian Draft Invoice (ubah ref, tanggal, dan sesuaikan nominal)
        const originalMove = registry.env('account.move').browse(invId);
        const newRef = 'INV-CUSTOM-REF-999';
        const newTotal = originalMove.amount_total + 25000;
        const updateRes = registry.env('account.move').update_draft_invoice(invId, {
            partner_id: customer.id,
            date: '2026-03-25',
            ref: newRef,
            amount_total: newTotal
        });
        assert.ok(updateRes.success, 'Update draft invoice harus berhasil');

        const updatedMove = registry.env('account.move').browse(invId);
        assert.strictEqual(updatedMove.ref, newRef, 'Ref invoice harus terupdate');
        assert.strictEqual(updatedMove.amount_total, newTotal, 'Amount total invoice harus terupdate');
        assert.strictEqual(updatedMove.amount_residual, newTotal, 'Amount residual harus terupdate');

        // 7. Konfirmasi Invoice (Post)
        const postRes = registry.env('account.move').action_post(invId);
        assert.ok(postRes.success, 'Konfirmasi invoice harus berhasil');

        ordersToInv = registry.env('account.move').get_orders_to_invoice();
        targetOrder = ordersToInv.find(o => o.so_id === so.id);
        assert.strictEqual(targetOrder.invoice_state, 'posted', 'Status invoice harus posted setelah konfirmasi');

        // 8. Cek Data Cetak Invoice
        const printData = registry.env('account.move').get_invoice_print_data(invId);
        assert.ok(printData.invoice, 'Data invoice cetak harus ada');
        assert.strictEqual(printData.invoice.id, invId);
        assert.ok(printData.company, 'Data perusahaan cetak harus ada');
        assert.ok(printData.items.length > 0, 'Daftar item cetak harus ada');

        // 9. Bayar (Register Payment)
        const bankJournal = db.prepare("SELECT id FROM account_journal WHERE code = 'BNK1'").get();
        const payRes = registry.env('account.move').action_register_payment(invId, {
            journal_id: bankJournal.id,
            amount: newTotal
        });
        assert.ok(payRes.success, 'Pembayaran harus berhasil');
        assert.strictEqual(payRes.new_state, 'paid', 'Status harus menjadi paid');

        // 10. Verifikasi status invoice di Pesanan Siap Ditagih menjadi paid
        ordersToInv = registry.env('account.move').get_orders_to_invoice();
        targetOrder = ordersToInv.find(o => o.so_id === so.id);
        assert.strictEqual(targetOrder.invoice_payment_state, 'paid', 'Status pembayaran faktur harus paid');

        console.log(`     -> Orders To Invoice: SO ${targetOrder.so_name} -> Draft ${invId} (Edited) -> Posted -> Paid -> Print OK`);
    });

    // ------------------------------------------------------------------------
    // TEST 29: MODUL PENJUALAN - MARGIN ANALISIS PER ITEM & TOTAL MARGIN
    // ------------------------------------------------------------------------
    test('29. Penjualan: Margin Analisis per Item & Total Margin (HPP vs Harga Jual)', () => {
        const customer = db.prepare("SELECT id FROM res_partner WHERE is_customer = 1 LIMIT 1").get();
        const prodTerigu = db.prepare("SELECT id, name, list_price, standard_price FROM product_template WHERE default_code = 'RM-TRG-01'").get();
        const prodGula = db.prepare("SELECT id, name, list_price, standard_price FROM product_template WHERE default_code = 'RM-GLA-02'").get();

        const qtyTerigu = 10;
        const qtyGula = 20;

        const so = registry.env('sale.order').create({
            partner_id: customer.id,
            notes: 'Uji Margin SO',
            lines: [
                { product_id: prodTerigu.id, product_uom_qty: qtyTerigu, price_unit: prodTerigu.list_price },
                { product_id: prodGula.id, product_uom_qty: qtyGula, price_unit: prodGula.list_price }
            ]
        });

        const browsedSo = registry.env('sale.order').browse(so.id);
        assert.strictEqual(browsedSo.order_lines.length, 2, 'Harus ada 2 baris item');

        let totalExpectedCost = 0;
        let totalExpectedSales = 0;

        for (const line of browsedSo.order_lines) {
            assert.ok(line.standard_price !== undefined, 'standard_price harus dimuat di order line');
            assert.ok(line.standard_price > 0, 'standard_price harus > 0');

            const expectedLineCost = line.standard_price * line.product_uom_qty;
            const expectedLineMarginRp = line.price_subtotal - expectedLineCost;
            const expectedLineMarginPct = (expectedLineMarginRp / line.price_subtotal) * 100;

            totalExpectedCost += expectedLineCost;
            totalExpectedSales += line.price_subtotal;

            assert.strictEqual(line.price_subtotal, line.price_unit * line.product_uom_qty, 'Subtotal line harus tepat');
            console.log(`     -> Item ${line.product_name}: Qty ${line.product_uom_qty}, Modal Rp ${line.standard_price.toLocaleString('id-ID')}, Jual Rp ${line.price_unit.toLocaleString('id-ID')}, Margin Rp ${expectedLineMarginRp.toLocaleString('id-ID')} (${expectedLineMarginPct.toFixed(1)}%)`);
        }

        const totalExpectedMarginRp = totalExpectedSales - totalExpectedCost;
        const totalExpectedMarginPct = (totalExpectedMarginRp / totalExpectedSales) * 100;

        assert.ok(totalExpectedMarginRp > 0, 'Total margin harus positif');
        console.log(`     -> Total Penjualan: Rp ${totalExpectedSales.toLocaleString('id-ID')}, Total Modal HPP: Rp ${totalExpectedCost.toLocaleString('id-ID')}, Total Margin: Rp ${totalExpectedMarginRp.toLocaleString('id-ID')} (${totalExpectedMarginPct.toFixed(1)}%)`);
    });

    // ------------------------------------------------------------------------
    // TEST 30: FITUR TANDA TANGAN DIGITAL RESMI (DIGITAL SIGNATURE ENGINE)
    // ------------------------------------------------------------------------
    test('30. Digital Signature: Tanda Tangan Digital, Audit Hash SHA-256, Chatter Log, & Print Integration', () => {
        const customer = db.prepare("SELECT id, name FROM res_partner WHERE is_customer = 1 LIMIT 1").get();
        const prod = db.prepare("SELECT id, name, list_price FROM product_template LIMIT 1").get();

        // 1. Buat Sales Order & Invoice
        const so = registry.env('sale.order').create({
            partner_id: customer.id,
            notes: 'SO untuk Uji Digital Signature',
            lines: [{ product_id: prod.id, product_uom_qty: 2, price_unit: prod.list_price }]
        });
        registry.env('sale.order').action_confirm(so.id);
        const invRes = registry.env('sale.order').action_create_invoice(so.id);
        const invId = invRes.invoice_id;

        // 2. Tanda Tangani SO oleh Pelanggan (Draw Mode)
        const dummyDrawPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const sigSo = registry.env('digital.signature').create({
            res_model: 'sale.order',
            res_id: so.id,
            signer_name: customer.name,
            signer_role: 'Pelanggan (Customer)',
            signature_data: dummyDrawPng,
            signature_type: 'draw'
        });

        assert.ok(sigSo.id, 'Signature SO ID harus terbentuk');
        assert.ok(sigSo.sign_hash.startsWith('SIG-'), 'Hash audit harus berformat SIG-YYYY-XXXX-YYYY');
        assert.strictEqual(sigSo.signer_name, customer.name);

        // Cek Chatter SO
        const soChatter = registry.env('mail.message').get_logs('sale.order', so.id);
        const sigSoMsg = soChatter.find(m => m.body.includes(sigSo.sign_hash));
        assert.ok(sigSoMsg, 'Chatter SO harus memuat log audit tanda tangan');

        // 3. Tanda Tangani Faktur oleh Pejabat Perusahaan (Type Cursive Mode)
        const sigInv = registry.env('digital.signature').create({
            res_model: 'account.move',
            res_id: invId,
            signer_name: 'Budi Santoso, S.E.',
            signer_role: 'Direktur Utama',
            signature_data: dummyDrawPng,
            signature_type: 'type'
        });

        assert.ok(sigInv.id, 'Signature Invoice ID harus terbentuk');
        assert.ok(sigInv.sign_hash.startsWith('SIG-'));

        // Cek browse model memuat .signatures
        const browsedMove = registry.env('account.move').browse(invId);
        assert.ok(browsedMove.signatures.length >= 1, 'Move harus memuat signatures');
        assert.strictEqual(browsedMove.signatures[0].signer_name, 'Budi Santoso, S.E.');

        // 4. Verifikasi get_invoice_print_data memuat customerSignature dan authorizedSignature
        const printData = registry.env('account.move').get_invoice_print_data(invId);
        assert.ok(printData.authorizedSignature, 'authorizedSignature harus terisi');
        assert.strictEqual(printData.authorizedSignature.signer_name, 'Budi Santoso, S.E.');
        assert.ok(printData.customerSignature, 'customerSignature harus terisi dari SO');
        assert.strictEqual(printData.customerSignature.signer_name, customer.name);

        // 5. Uji Pembatalan / Hapus Tanda Tangan
        const delRes = registry.env('digital.signature').delete_signature(sigInv.id);
        assert.ok(delRes.success, 'Hapus signature harus berhasil');

        const remainingSigs = registry.env('digital.signature').get_signatures('account.move', invId);
        assert.strictEqual(remainingSigs.length, 0, 'Signature move harus kosong setelah dihapus');

        const invChatter = registry.env('mail.message').get_logs('account.move', invId);
        const delMsg = invChatter.find(m => m.body.includes('dihapus'));
        assert.ok(delMsg, 'Chatter invoice harus mencatat log penghapusan tanda tangan');

        console.log(`     -> Digital Signature SO: ${sigSo.sign_hash} (Chatter Logged)`);
        console.log(`     -> Digital Signature Invoice: ${sigInv.sign_hash} (Print Cascaded & Revocation Verified)`);
    });

    console.log('================================================================');
    console.log(`📊 HASIL PENGUJIAN: ${passed} LULUS, ${failed} GAGAL`);
    if (failed === 0) {
        console.log('🎉 SELURUH SISTEM ERP LOCAL CORE ENGINE + FULL SUITE AKUNTANSI BERJALAN 100% SEMPURNA!');
    }
    console.log('================================================================');
}

runLocalVerification().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
