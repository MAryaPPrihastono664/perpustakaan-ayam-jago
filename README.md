# API Perpustakaan Ayam Jago

Backend RESTful API untuk sistem manajemen perpustakaan sederhana. Dibangun menggunakan **Node.js**, **Express**, dan **PostgreSQL**. Aplikasi ini dirancang dengan fokus pada keamanan data (JWT & Bcrypt), efisiensi memori, dan integritas data menggunakan Database Transactions.

## Fitur Utama

* **Autentikasi Aman:** Registrasi & Login menggunakan JWT (JSON Web Token) dan hashing password (Bcrypt).
* **Manajemen Buku:** Pencarian buku (Partial & Exact Match) dengan Pagination.
* **Sirkulasi Buku:** Peminjaman (Borrow) dan Pengembalian (Return) dengan validasi stok real-time.
* **Keamanan Data:** Menggunakan **SQL Transactions** untuk mencegah kebocoran data saat peminjaman/pengembalian.
* **Optimasi Memori:** Konfigurasi *Connection Pooling* database dan *streaming* data untuk performa tinggi di server kecil (VPS/Docker).
* **Containerized:** Siap dijalankan menggunakan Docker & Docker Compose.

## Teknologi yang Digunakan

* [Node.js](https://nodejs.org/) - Runtime Environment
* [Express.js](https://expressjs.com/) - Web Framework
* [PostgreSQL](https://www.postgresql.org/) - Database (dihosting di neon)
* [Docker](https://www.docker.com/) - Containerization

## Persyaratan Sistem

Sebelum menjalankan, pastikan kamu memiliki:

* **Docker Desktop** (Disarankan)
* Atau **Node.js v18+** (Jika ingin menjalankan manual tanpa Docker)
* URL Koneksi Database PostgreSQL (misal: dari Neon.tech, Supabase, atau Localhost)

## Cara Menjalankan (Docker - Disarankan)

1. **Clone Repository**
```bash
git clone https://github.com/username-kamu/repo-ini.git
cd repo-ini

```


2. **Buat File `.env**`
Buat file baru bernama `.env` di folder root, lalu isi dengan konfigurasi berikut:
```env
DATABASE_URL=postgres://user:password@host:port/database?sslmode=require
SECRET_KEY=rahasia_super_aman_ganti_ini

```


3. **Jalankan dengan Docker Compose**
```bash
docker-compose up --build -d

```


4. **Selesai!**
API berjalan di: `http://localhost:3068`

## Cara Menjalankan (Manual / Localhost)

1. **Install Dependencies**
```bash
npm install

```


2. **Setup Environment**
Pastikan file `.env` sudah dibuat seperti langkah di atas.
3. **Jalankan Server**
```bash
node index.js

```


Server akan berjalan di `http://localhost:3000`

---

## Dokumentasi API

Base URL (Docker): `http://localhost:3068`

### 1. Autentikasi (User)

| Method | Endpoint | Deskripsi | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/register` | Mendaftarkan pengguna baru | Public |
| `POST` | `/api/login` | Login user & mendapatkan Token | Public |
| `DELETE` | `/api/unregister` | Menghapus akun (Jika tidak ada pinjaman) | **Token** |

### 2. Buku (Books)

| Method | Endpoint | Deskripsi | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/books` | List semua buku (Pagination) | Public |
| `GET` | `/api/books?search=...` | Cari buku (Judul/Penulis) | Public |

**Query Params untuk Buku:**

* `page`: Nomor halaman (Default: 1)
* `search`: Kata kunci pencarian
* `exact`: `true` untuk pencarian persis, kosongkan untuk pencarian mirip.

### 3. Transaksi (Transactions)

| Method | Endpoint | Deskripsi | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/borrow` | Meminjam buku (Stok -1) | **Token** |
| `POST` | `/api/return` | Mengembalikan buku (Stok +1) | **Token** |
| `GET` | `/api/borrows` | Riwayat peminjaman user | **Token** |

---

## Catatan Keamanan & Optimasi

* **Database Transaction:** Endpoint `/borrow` dan `/return` dibungkus dalam blok `BEGIN...COMMIT` SQL. Ini menjamin jika terjadi error di tengah proses, database akan melakukan `ROLLBACK` sehingga stok buku tidak hilang misterius.
* **Connection Pooling:** Aplikasi dikonfigurasi dengan `max: 5` koneksi database untuk menjaga penggunaan RAM tetap rendah di lingkungan container.
* **Docker Optimization:** Dockerfile menggunakan teknik *layer caching* (copy `package.json` duluan) untuk mempercepat proses build ulang.

