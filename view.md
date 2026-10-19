# Panduan & Standar Desain Antarmuka (UI/UX Design System Guidelines)
**Sistem:** Naklasa Wholesale & Distribution ERP  
**Target Pengguna:** UI/UX Designer (Figma / Mockup) & Frontend Developer (Implementasi Kode)  
**Versi:** 1.0.0 (Status: 19 Oktober 2026)  
**Tingkat Kepadatan:** High Density (8/10) | **Gaya Gerak:** Subtle & Purposeful (3/10)

---

## Daftar Isi
1. [Prinsip Desain & Identitas Produk](#1-prinsip-desain--identitas-produk)
2. [Design Tokens (Warna, Tipografi, Spasi, Elevasi)](#2-design-tokens)
3. [Standar Komponen Antarmuka](#3-standar-komponen-antarmuka)
4. [Pedoman Khusus Domain Grosir & Keuangan](#4-pedoman-khusus-domain-grosir--keuangan)
5. [Aksesibilitas (WCAG 2.1 AA) & Responsivitas](#5-aksesibilitas--responsivitas)
6. [Daftar Pantangan (Anti-Patterns / Anti-Slop)](#6-daftar-pantangan-anti-patterns)
7. [Kontrak Kolaborasi Designer & Developer (Handover Checklist)](#7-kontrak-kolaborasi-designer--developer)

---

## 1. Prinsip Desain & Identitas Produk

Aplikasi Naklasa adalah sistem Enterprise Resource Planning (ERP) grosir dan distribusi sembako/barang kebutuhan pokok yang digunakan dalam operasional cepat sehari-hari.

### Tiga Pilar Utama:
1. **High Information Density, Zero Ambiguity**
   - Layar kerja harus mampu menampilkan data volume tinggi (daftar puluhan faktur, baris barang pesanan, plafon kredit) tanpa membuang-buang ruang layar.
   - Setiap elemen memiliki arti bisnis; tidak ada komponen yang diletakkan hanya sebagai dekorasi tanpa fungsi.
2. **Fail-Closed & Role-Aware Visibility**
   - Tampilan antarmuka harus menghormati hak akses pengguna (Owner, Admin Bisnis, Sales, Kasir, Kepala Gudang).
   - Data rahasia seperti HPP (Avg Cost) dan margin floor tidak boleh bocor ke staf gudang atau sales (Kepatuhan SEC-03 & SEC-09).
3. **Operational Speed & Keyboard Accessibility**
   - Kasir dan staf admin memproses ratusan pesanan per hari. Transisi fokus antar kolom input harus mulus melalui keyboard (Tab, Enter, Esc), tanpa ketergantungan wajib pada mouse.

---

## 2. Design Tokens

Seluruh nilai di bawah ini adalah acuan baku. **UI/UX Designer** wajib menggunakannya sebagai *Figma Variables / Color Styles*, dan **Frontend Developer** mengimplementasikannya melalui CSS Custom Properties di `:root`.

### 2.1 Sistem Warna (Color Palette)

#### A. Warna Netral (Slate Neutral)
Digunakan untuk latar belakang, kartu surface, teks, dan pembatas data:

| Token Name | Hex Code | Penggunaan di Desain & Frontend |
|---|---|---|
| `--color-bg` | `#F8FAFC` | Latar belakang kanvas aplikasi |
| `--color-surface` | `#FFFFFF` | Latar kartu (*card*), modal, dan dropdown |
| `--color-surface-hover` | `#F1F5F9` | Hover pada baris tabel, item list, dan menu |
| `--color-border` | `#E2E8F0` | Garis tepi kartu, input form, dan pemisah kolom |
| `--color-border-subtle` | `#CBD5E1` | Garis pemisah sekunder / header tabel |
| `--color-text-main` | `#0F172A` | Teks judul, angka nominal, teks utama (Kontras > 12:1) |
| `--color-text-muted` | `#475569` | Label form, deskripsi subjudul, isi sel sekunder |
| `--color-text-subtle` | `#64748b` | Teks bantuan (*helper text*), placeholder, timestamp |

#### B. Warna Brand & Interaksi Utama (Corporate Trust Blue)
| Token Name | Hex Code | Penggunaan |
|---|---|---|
| `--color-primary` | `#1E40AF` | Tombol CTA utama, tab aktif, link utama |
| `--color-primary-hover` | `#1D4ED8` | State hover tombol primary |
| `--color-primary-light` | `#EFF6FF` | Background chip/badge peran, highlight baris aktif |
| `--color-primary-border` | `#BFDBFE` | Border aksen primary |

#### C. Warna Status Bisnis (Semantic Status Tokens)
Dilarang menggunakan warna neon atau gradien. Gunakan kombinasi background lembut + teks tegas:

| Status Bisnis | Background Token (`* -bg`) | Teks / Border Token | Arti Semantik ERP |
|---|---|---|---|
| **Success / Confirmed** | `#F0FDF4` (`--color-success-bg`) | `#15803D` (`--color-success`) | SO Berhasil Dikonfirmasi, Faktur Lunas, Pelanggan Aktif |
| **Warning / Pending** | `#FFFBEB` (`--color-warning-bg`) | `#B45309` (`--color-warning`) | Menunggu Approval Owner, Cicilan Sebagian, Mendekati Jatuh Tempo |
| **Danger / Critical** | `#FEF2F2` (`--color-danger-bg`) | `#B91C1C` (`--color-danger`) | Kredit Hold H+30, SO Batal, Margin Kurang, Error Validasi |
| **Neutral / Draft** | `#F1F5F9` (`--color-neutral-bg`) | `#475569` (`--color-neutral-text`)| Draft SO, Arsip, Log Audit Sistem |

---

### 2.2 Sistem Tipografi (Typography)

* **Font Utama:** `Inter` atau `Plus Jakarta Sans`
* **Font Monospace (Kode & Ref):** `SFMono-Regular`, `Consolas`, `Liberation Mono`, `monospace`

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

#### Skala Teks & Hirarki:
| Level | Ukuran (px / rem) | Weight | Line Height | Penggunaan |
|---|---|---|---|---|
| **H1 (Page Title)** | `20px` / `1.25rem` | 700 (Bold) | `1.3` | Judul layar utama workspace |
| **H2 (Section/Card Title)** | `15px` / `0.9375rem`| 600 (SemiBold) | `1.4` | Judul kartu data / sub-panel |
| **Body (Normal)** | `13px` / `0.8125rem`| 400 (Regular) | `1.5` | Isi tabel, form input, paragraf |
| **Body SemiBold** | `13px` / `0.8125rem`| 600 (SemiBold) | `1.5` | Nama pelanggan, total tagihan |
| **Label / Caption** | `11px` / `0.6875rem`| 600 (SemiBold) | `1.4` | Label input, badge, header kolom tabel |
| **Micro / Subtext** | `10px` / `0.625rem` | 500 (Medium) | `1.3` | Timestamp audit, rincian perizinan |

> [!IMPORTANT]
> **Aturan Wajib Tabular Numbers:**
> Semua angka nominal uang (Rupiah), kuantitas barang, nomor faktur, dan persentase diskon **WAJIB** menerapkan `font-variant-numeric: tabular-nums`. Hal ini mencegah angka bergoyang (*jumping*) saat nilai diperbarui dan memastikan angka pada kolom tabel tersusun lurus secara vertikal.

---

### 2.3 Skala Spasi (Spacing Scale - 8pt Grid)

Gunakan kelipatan berbasis sistem 4px / 8px:

| Token | Nilai | Implementasi Ideal |
|---|---|---|
| `--space-1` | `4px` | Jarak antar ikon dan teks kecil, padding badge |
| `--space-2` | `8px` | Padding tombol kecil, gap antar tombol aksi |
| `--space-3` | `12px` | Padding kolom tabel, margin antar baris form |
| `--space-4` | `16px` | Padding kartu (*card padding*), gap grid form |
| `--space-5` | `20px` | Padding dalam modal dialog, margin antar kartu |
| `--space-6` | `24px` | Margin antar section utama layar kerja |
| `--space-8` | `32px` | Pemisah layout besar / container gutter |

---

### 2.4 Skala Border Radius & Elevasi (Shadows)

* **Radius Kurva:**
  - Komponen ERP harus terasa terstruktur dan presisi (bukan seperti mainan atau aplikasi kasual).
  - `--radius-xs: 3px` (Badge, tag status)
  - `--radius-sm: 5px` (Tombol, input form, select)
  - `--radius-md: 7px` (Kartu utama, panel container)
  - `--radius-lg: 10px` (Modal pop-up dialog)
  - **Larangan:** Jangan membuat semua tombol atau input berbentuk kapsul (*pill-shaped* `border-radius: 9999px`). Kapsul hanya diizinkan untuk badge status hitungan pendek.

* **Shadow (Elevasi):**
  - Hanya digunakan untuk membedakan lapisan kedalaman, bukan dekorasi.
  - `--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05)` (Default kartu)
  - `--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06)` (Dropdown & Toast)
  - `--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.08)` (Modal Dialog)

---

## 3. Standar Komponen Antarmuka

### 3.1 Tombol (Button System)

| Tipe Tombol | Visual & Warna | Kegunaan |
|---|---|---|
| **Primary** | Background `#1E40AF`, teks putih | Aksi utama per layar (cth: "Hitung & Validasi", "Simpan Pelanggan") |
| **Secondary** | Background `#FFFFFF`, border `#E2E8F0`, teks `#0F172A` | Aksi pendukung (cth: "Reset Formulir", "Batal", "Segarkan") |
| **Success** | Background `#15803D`, teks putih | Konfirmasi final (cth: "Konfirmasi Pesanan", "Setujui: Tetap Tempo") |
| **Danger** | Background `#B91C1C` atau Outline `#FECACA` | Aksi destruktif (cth: "Tolak Order", "Batalkan Pesanan", "Arsipkan") |

**Spesifikasi Interaksi Tombol:**
- **State Hover:** Transisi warna lembut `150ms ease` (misal: `#1E40AF` menjadi `#1D4ED8`).
- **State Focus:** Wajib menampilkan ring luar `box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25)`.
- **State Disabled:** `opacity: 0.5`, `cursor: not-allowed`.
- **Touch Target:** Untuk pengguna tablet/mobile, target tap tombol minimal berukuran `44 × 44px`.

---

### 3.2 Formulir & Input Data

1. **Label Form:**
   - Wajib selalu tampak di atas input field (`font-size: 12px; font-weight: 600; color: #475569`).
   - Jangan pernah hanya mengandalkan *placeholder* sebagai label satu-satunya.
   - Kolom wajib ditandai bintang merah `<span class="required">*</span>`.
2. **Input State:**
   - **Default:** Border `#E2E8F0`, background `#FFFFFF`.
   - **Focus:** Border `#3B82F6`, ring glow `0 0 0 3px rgba(59, 130, 246, 0.15)`.
   - **Error:** Border `#DC2626`, teks bantuan di bawahnya berwarna `#B91C1C`.
   - **Readonly / Disabled:** Background `#F8FAFC`, teks `#64748B`, kursor `not-allowed`.

---

### 3.3 Tabel Data (Data Tables)

Tabel adalah jantung produktivitas aplikasi grosir.
* **Header Kolom (`<th>`):**
  - Huruf kapital kecil (`text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em`).
  - Latar belakang abu-abu terang `#F8FAFC`, border bawah `#E2E8F0`.
* **Penyelarasan Teks (Alignment):**
  - Teks deskriptif (Nama Pelanggan, Nama Barang): **Rata Kiri** (`text-align: left`).
  - Tanggal, Status, Badge, UOM: **Rata Tengah** (`text-align: center`).
  - Nilai Finansial (Harga, Total, Sisa Piutang, Qty): **Rata Kanan** (`text-align: right; font-variant-numeric: tabular-nums`).
* **Interaktivitas:**
  - Seluruh baris tabel mendapatkan efek hover halus (`background-color: #F1F5F9`).
  - Baris dengan tagihan kritis atau jatuh tempo dapat diberi aksen warna peringatan lembut.

---

### 3.4 Modal & Dialog

- **Backdrop:** Latar gelap semi-transparan `rgba(15, 23, 42, 0.5)` dengan transisi fade-in `150ms`.
- **Struktur:** Terbagi menjadi Header (judul & tombol close `×`), Body (area input/konfirmasi), dan Footer (tombol "Batal" dan aksi utama di sebelah kanan).
- **Aksesibilitas:**
  - Menekan tombol **Escape (ESC)** pada keyboard harus menutup modal.
  - Saat modal terbuka, fokus keyboard terkurung di dalam modal (*focus trap*).

---

### 3.5 Feedback & Notifikasi (Toast & Callout Alerts)

* **Toast Notification:**
  - Muncul di pojok kanan bawah (`bottom: 24px; right: 24px`).
  - Menggunakan aksen garis tebal di sebelah kiri (`border-left: 4px solid ...`): Hijau untuk sukses, Merah untuk kegagalan, Biru untuk info.
  - Otomatis tertutup dalam 4.5 detik atau dapat ditutup manual.
* **Callout Box (Alert di Layar):**
  - Digunakan saat validasi 7 Pengecekan Sistem (misal: "Order Tidak Dapat Dikonfirmasi", "Membutuhkan Persetujuan Owner").
  - Menampilkan daftar rincian alasan kegagalan dengan jelas dalam format *bullet points*.

---

## 4. Pedoman Khusus Domain Grosir & Keuangan

### 4.1 Format Mata Uang Indonesia
* Tuliskan selalu dengan awalan `Rp ` dan pemisah ribuan titik (`.`):
  - ✅ Benar: `Rp 1.000.000` / `Rp 30.285`
  - ❌ Salah: `Rp.1000000`, `IDR 1000000`, `$1,000,000`

### 4.2 Status Umur Piutang (Aging AR Badges)
Dalam tabel piutang (`sales_invoices`), visualisasi umur jatuh tempo diatur sebagai berikut:
1. **Lunas:** Badge hijau `#F0FDF4`, teks `#15803D` ("LUNAS").
2. **Belum Jatuh Tempo:** Teks abu-abu lembut `Tempo dlm X hari`.
3. **Lewat Jatuh Tempo (< 30 hari):** Badge amber `#FEF3C7`, teks `#92400E` ("Lewat X hari").
4. **Lewat Jatuh Tempo (≥ 30 hari - Hold H+30):**
   - Wajib menggunakan badge merah tegas bergaris tepi:  
     `background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; font-weight: 700;`
   - Label teks: `Lewat X hari ⚠️ (HOLD H+30)`
   - Status ini memberi sinyal langsung kepada tim Sales & Admin mengapa pesanan baru pelanggan tersebut ditolak/ditahan sistem.

### 4.3 Kepatuhan Keamanan Kolom Rahasia (SEC-03 & SEC-09)
* **Harga Pokok Penjualan (Avg Cost / COGS):**
  - Hanya boleh ditampilkan kepada persona **Pak Budi (Owner)**.
  - Untuk persona Sales, Kasir, atau Gudang, kolom ini wajib menampilkan chip penanda:
    `<span class="confidential-chip">DIRAHASIAKAN</span>` (Latar merah muda lembut, teks merah tua).
* **Picking List Gudang (Rudi - Kepala Gudang):**
  - Dokumen atau tabel pengambilan barang di gudang **DILARANG KERAS** menampilkan harga satuan, total nominal uang, atau status piutang toko.
  - Hanya menampilkan: SKU, Nama Barang, Lokasi Rak/Bin, Satuan Gudang (Dus/Karton), dan Total Qty Dasar (Pcs).

---

## 5. Aksesibilitas & Responsivitas

### 5.1 Standar WCAG 2.1 AA
1. **Kontras Warna:**
   - Semua teks body terhadap latar belakang wajib memiliki rasio kontras minimal **4.5:1**.
   - Komponen UI dan teks berukuran besar (≥ 18px bold) minimal **3:1**.
2. **Navigasi Keyboard:**
   - Setiap elemen interaktif (`<a>`, `<button>`, `<input>`, `<select>`) wajib memiliki indikator `:focus-visible` yang jelas.
   - Dilarang mematikan outline (`outline: none`) tanpa memberikan pengganti ring fokus.
3. **Dukungan Pengurangan Gerakan (*Reduced Motion*):**
   - Jika pengguna mengaktifkan preferensi OS `prefers-reduced-motion: reduce`, matikan seluruh animasi transisi layout.

### 5.2 Breakpoints Tata Letak Responsif
* **Mobile (< 768px):** Navigasi tab dapat digeser horizontal (*overflow-x: auto*); tabel dibungkus container `.table-responsive` agar dapat digeser horizontal tanpa merusak layout luar.
* **Tablet (768px – 1024px):** Grid 4 kolom beralih menjadi 2 kolom.
* **Desktop (≥ 1024px):** Tampilan penuh 2 kolom pada Studio Order (formulir draft di kiri, kartu kalkulasi & validasi mengambang (*sticky*) di kanan).

---

## 6. Daftar Pantangan (Anti-Patterns / Anti-Slop)

Sebagai panduan mutu produk enterprise, desainer dan developer **DILARANG** menerapkan hal-hal berikut:

| Anti-Pattern (Slop) | Alasan Dilarang | Solusi yang Benar |
|---|---|---|
| **Gradien Biru-Ungu / Neon** | Menandakan desain template AI generik; tidak cocok untuk ERP korporat | Gunakan Slate-Navy solid `#0F172A` dan Trust Blue `#1E40AF` |
| **Emoji sebagai Ikon Dekoratif** | Terkesan tidak profesional (misal: 🚀, 🔥, 📈 di tombol/header) | Gunakan ikon SVG garis bersih berstandar industri |
| **Glassmorphism Berlebihan** | Mengaburkan keterbacaan data dan memberatkan kinerja GPU | Gunakan kartu surface solid putih `#FFFFFF` dengan border terukur |
| **Semua Elemen Berbentuk Kapsul** | Menghilangkan hirarki visual pembeda input, kartu, dan tombol | Gunakan border radius terukur (`sm: 5px`, `md: 7px`) |
| **Tombol Mati (Dead Controls)** | Tombol ada tapi tidak ada aksi/kode backend | Setiap tombol harus memiliki handler API nyata |
| **Metrik Palsu (+12% this week)** | Menyajikan data tren fiktif tanpa series data riil | Tampilkan angka nyata dari query faktur/penjualan atau hilangkan delta jika tidak ada |
| **Animasi Berdenyut Terus-Menerus** | Denyut tanpa henti mengganggu konsentrasi operator toko | Gunakan warna status statis tanpa looping pulse |

---

## 7. Kontrak Kolaborasi Designer & Developer

Sebelum sebuah halaman atau komponen dinyatakan selesai, periksa daftar uji berikut:

### Checklist untuk UI/UX Designer (Figma):
- [ ] Menggunakan variabel warna resmi (Primary `#1E40AF`, Slate `#0F172A`, Semantic Green/Amber/Red).
- [ ] Teks nominal uang telah diverifikasi menggunakan opsi Figma *Tabular Figures*.
- [ ] Form input menyertakan label tetap (bukan placeholder semata) dan indikator required `*`.
- [ ] Desain menyertakan state interaksi lengkap: Default, Hover, Active, Disabled, dan Error State.
- [ ] Komponen modal menyertakan tombol close dan visualisasi backdrop overlay.
- [ ] Desain responsif disediakan minimal untuk viewport 375px (mobile) dan 1366px+ (desktop).

### Checklist untuk Frontend Developer (Kode):
- [ ] Semua variabel warna merujuk ke token CSS di `app.css` (tidak ada *hardcoded hex color* sembarangan di komponen).
- [ ] Seluruh nilai mata uang, kuantitas, dan nomor transaksi memiliki class `.tabular-nums`.
- [ ] Form dapat dinavigasi dengan tombol `Tab` dan disubmit dengan tombol `Enter`.
- [ ] Dialog modal dapat ditutup dengan tombol `Esc` dan mengunci scroll latar belakang.
- [ ] Kepatuhan SEC-03 & SEC-09 diterapkan (kolom HPP terkunci jika persona bukan Owner).
- [ ] Tidak ada tautan mati (*dead links*) atau tombol tanpa fungsi tanggapan.
- [ ] Uji responsivitas tabel: Tidak ada layout pecah atau terpotong pada layar ponsel.
