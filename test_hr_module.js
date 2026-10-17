// ============================================================================
// ERP LOCAL ENGINE - HR MODULE AUTOMATED VERIFICATION TEST (test_hr_module.js)
// Menguji seluruh alur kerja Modul Human Resources secara lokal:
// 1. Departemen & Posisi Jabatan
// 2. Karyawan (Employees) Master Data & Profil
// 3. Presensi & Absensi (Check-in / Check-out Live Punch Clock)
// 4. Manajemen Cuti & Izin (Time Off Approval & Refusal)
// 5. Kontrak Kerja Karyawan (Wages & Allowances)
// 6. Payroll & Slip Gaji (Gross, BPJS, PPh 21, Net Wage)
// 7. Integrasi Double-Entry Akuntansi (Posting Beban Gaji ke Buku Besar)
// 8. Pipeline Rekrutmen (Pelamar, Tahapan, & Konversi ke Karyawan)
// 9. Klaim Biaya (Expenses & Reimbursement)
// ============================================================================

const assert = require('node:assert');
const { registry } = require('./core/orm');
const { db } = require('./core/db');

console.log('================================================================');
console.log('🧪 PENGUJIAN OTOMATIS HR CORE ENGINE');
console.log('================================================================');

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

// 1. DEPARTMENTS & JOBS
test('1. Verifikasi Data Departemen & Posisi Jabatan', () => {
    const depts = registry.env('hr.department').search_read();
    assert.ok(depts.length >= 5, `Expected >= 5 departments, got ${depts.length}`);

    const jobs = registry.env('hr.job').search_read();
    assert.ok(jobs.length >= 8, `Expected >= 8 jobs, got ${jobs.length}`);

    const hrDept = depts.find(d => d.name.includes('HR'));
    assert.ok(hrDept, 'Departemen HR harus ditemukan');
    assert.ok(hrDept.total_employee >= 1, 'Departemen HR harus memiliki karyawan terdaftar');
});

// 2. EMPLOYEES
test('2. Verifikasi Data Karyawan & Profil', () => {
    const emps = registry.env('hr.employee').search_read();
    assert.ok(emps.length >= 6, `Expected >= 6 employees, got ${emps.length}`);

    const armin = emps.find(e => e.name.includes('Armin'));
    assert.ok(armin, 'Karyawan Armin Arlert harus ditemukan');

    const profile = registry.env('hr.employee').browse(armin.id);
    assert.ok(profile, 'Browse profil karyawan harus sukses');
    assert.ok(profile.job_name, 'Job position harus ter-resolve');
    assert.ok(profile.contract, 'Kontrak kerja aktif harus terhubung');

    const kpis = registry.env('hr.employee').get_kpis();
    assert.ok(kpis.totalEmployees >= 6, 'Total karyawan KPI');
    assert.ok(kpis.totalPayroll > 0, 'Total payroll belanja bulanan harus valid');
});

// 3. ATTENDANCE PUNCH CLOCK
test('3. Presensi & Absensi (Toggle Check-in / Check-out)', () => {
    const emps = registry.env('hr.employee').search_read();
    const testEmp = emps[0];
    const initialStatus = testEmp.attendance_status;

    // Toggle 1
    const res1 = registry.env('hr.attendance').action_check_in_out(testEmp.id);
    assert.ok(res1.success, 'Toggle presensi pertama harus sukses');

    const empAfter1 = registry.env('hr.employee').browse(testEmp.id);
    assert.notStrictEqual(empAfter1.attendance_status, initialStatus, 'Status presensi harus berubah');

    // Toggle 2 (kembalikan ke status semula)
    const res2 = registry.env('hr.attendance').action_check_in_out(testEmp.id);
    assert.ok(res2.success, 'Toggle presensi kedua harus sukses');

    const todaySummary = registry.env('hr.attendance').get_today_summary();
    assert.ok(todaySummary.today, 'Tanggal hari ini harus ada');
    assert.ok(Array.isArray(todaySummary.present_employees), 'Daftar karyawan hadir hari ini');
});

// 4. LEAVES / TIME OFF
test('4. Pengajuan & Persetujuan Cuti Karyawan', () => {
    const emps = registry.env('hr.employee').search_read();
    const leaveTypes = registry.env('hr.leave.type').search_read();
    assert.ok(leaveTypes.length >= 4, 'Tipe cuti minimal 4');

    const newLeave = registry.env('hr.leave').create({
        name: 'Cuti Keperluan Pribadi & Urusan Notaris',
        employee_id: emps[1].id,
        holiday_status_id: leaveTypes[0].id,
        date_from: '2026-11-01',
        date_to: '2026-11-02',
        number_of_days: 2.0,
        notes: 'Urusan keluarga mendesak'
    });
    assert.ok(newLeave.id, 'ID cuti harus dibuat');

    const leaveRec = registry.env('hr.leave').browse(newLeave.id);
    assert.strictEqual(leaveRec.state, 'confirm', 'Status awal pengajuan cuti harus confirm');

    // Approve
    const appRes = registry.env('hr.leave').action_approve(newLeave.id, 'Armin Arlert (HR Lead)');
    assert.ok(appRes.success, 'Persetujuan cuti harus berhasil');

    const leaveRecApproved = registry.env('hr.leave').browse(newLeave.id);
    assert.strictEqual(leaveRecApproved.state, 'validate', 'Status cuti setelah approve harus validate');
});

// 5. CONTRACTS
test('5. Pembuatan Kontrak Kerja Baru', () => {
    const emps = registry.env('hr.employee').search_read();
    const newCtr = registry.env('hr.contract').create({
        employee_id: emps[2].id,
        wage: 11000000,
        meal_allowance: 1200000,
        transport_allowance: 1000000,
        other_allowance: 500000,
        date_start: '2026-10-01',
        contract_type: 'permanent',
        notes: 'Perpanjangan kontrak kerja tahunan'
    });
    assert.ok(newCtr.id, 'ID kontrak harus terbuat');
    assert.ok(newCtr.name.startsWith('CTR/2026/'), 'Format nomor kontrak CTR/2026/');
});

// 6. PAYROLL & ACCOUNTING INTEGRATION
test('6. Payroll & Posting Double-Entry ke Akuntansi (account_move)', () => {
    const emps = registry.env('hr.employee').search_read();
    const targetEmp = emps.find(e => e.name.includes('Mikasa')) || emps[0];

    // Buat slip gaji
    const newSlip = registry.env('hr.payslip').create({
        employee_id: targetEmp.id,
        period_month: '2026-10',
        date_from: '2026-10-01',
        date_to: '2026-10-31',
        basic_wage: 14000000,
        allowances: 3200000,
        overtime_pay: 800000
    });
    assert.ok(newSlip.id, 'ID slip gaji harus terbuat');
    assert.ok(newSlip.number.startsWith('SLIP/2026/'), 'Format slip SLIP/2026/');

    // Komputasi
    const compRes = registry.env('hr.payslip').compute_sheet(newSlip.id);
    assert.ok(compRes.success, 'Komputasi sheet harus sukses');
    assert.strictEqual(compRes.gross, 18000000, 'Gross wage = 14jt + 3.2jt + 0.8jt = 18jt');

    // Validasi
    registry.env('hr.payslip').action_payslip_done(newSlip.id);

    // Posting ke Akuntansi
    const payRes = registry.env('hr.payslip').action_pay_and_post_accounting(newSlip.id, 'bank');
    assert.ok(payRes.success, 'Posting payroll ke jurnal akuntansi harus sukses');
    assert.ok(payRes.accounting_move, 'Nomor jurnal akuntansi harus terbentuk');

    // Periksa jurnal di account_move & account_move_line
    const move = registry.env('account.move').browse(payRes.move_id);
    assert.ok(move, 'Entri jurnal akuntansi harus ada di database');
    assert.strictEqual(move.state, 'posted', 'Entri jurnal harus berstatus posted');

    // Periksa keseimbangan Debit == Credit (Double-Entry Principle)
    const totalDebit = move.line_ids.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = move.line_ids.reduce((sum, l) => sum + l.credit, 0);
    assert.strictEqual(Math.round(totalDebit), Math.round(totalCredit), `Buku besar harus seimbang: Debit (${totalDebit}) == Credit (${totalCredit})`);

    // Slip print data
    const printData = registry.env('hr.payslip').get_payslip_print_data(newSlip.id);
    assert.ok(printData.success, 'Data cetak slip gaji harus tersedia');
    assert.ok(printData.company, 'Data perusahaan harus terlampir');
});

// 7. RECRUITMENT PIPELINE & HIRE CONVERSION
test('7. Rekrutmen: Pendaftaran Pelamar & Konversi Menjadi Karyawan', () => {
    const jobs = registry.env('hr.job').search_read();
    assert.ok(jobs.length > 0, 'Harus ada job');

    const newApp = registry.env('hr.applicant').create({
        name: 'Reiner Braun',
        email: 'reiner.braun@example.com',
        phone: '0812-9999-7777',
        job_id: jobs[0].id,
        stage: 'initial',
        priority: 4,
        salary_expected: 13500000,
        description: 'Candidate Senior Logistics Manager'
    });
    assert.ok(newApp.id, 'ID pelamar harus terbuat');

    // Pindah stage
    registry.env('hr.applicant').action_set_stage(newApp.id, 'contract_proposal');
    const appRec = registry.env('hr.applicant').browse(newApp.id);
    assert.strictEqual(appRec.stage, 'contract_proposal', 'Tahapan pelamar harus berubah');

    // Action Hire (Konversi ke Karyawan)
    const hireRes = registry.env('hr.applicant').action_hire_employee(newApp.id);
    assert.ok(hireRes.success, 'Konversi pelamar ke karyawan baru harus berhasil');
    assert.ok(hireRes.employee_id, 'Employee ID baru harus terbentuk');

    const hiredEmp = registry.env('hr.employee').browse(hireRes.employee_id);
    assert.ok(hiredEmp, 'Karyawan baru harus terdaftar di hr_employee');
    assert.strictEqual(hiredEmp.name, 'Reiner Braun', 'Nama karyawan harus cocok');
});

// 8. EXPENSES
test('8. Klaim Biaya (Expenses) & Pembayaran Reimbursement', () => {
    const emps = registry.env('hr.employee').search_read();
    const newExp = registry.env('hr.expense').create({
        name: 'Bensin & Tol Distribusi Bakery Bogor',
        employee_id: emps[0].id,
        category: 'fuel',
        total_amount: 275000,
        payment_mode: 'reimbursement',
        notes: 'Pengantaran sampel produk'
    });
    assert.ok(newExp.id, 'ID klaim biaya harus terbuat');

    // Approve
    registry.env('hr.expense').action_approve(newExp.id);
    // Pay & post to accounting
    const payRes = registry.env('hr.expense').action_pay(newExp.id, 'cash');
    assert.ok(payRes.success, 'Pembayaran klaim biaya harus sukses');
    assert.ok(payRes.accounting_move, 'Jurnal reimbursement harus terbentuk');
});

console.log('================================================================');
console.log(`🎉 PENGUJIAN SELESAI: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
