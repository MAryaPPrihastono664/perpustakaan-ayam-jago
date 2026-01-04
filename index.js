require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs'); // 1. Tambahkan ini

const app = express();
const port = 3000;

app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const SECRET_KEY = process.env.SECRET_KEY;

// ... (Middleware authenticateToken TETAP SAMA, tidak perlu diubah) ...
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Akses ditolak!" });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: "Token invalid!" });
        req.user = user;
        next();
    });
}

app.get('/', (req, res) => {
    res.send('API Perpustakaan Ayam Jago (Secure Password Version) 🔐');
});

// --- ROUTE LOGIN YANG DIPERBARUI ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body; // Password inputan user: "123"
    
    try {
        // 1. Cari user berdasarkan username saja
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        // Cek user ketemu atau tidak
        if (result.rows.length === 0) {
            return res.status(401).json({ message: "Username atau Password salah!" });
        }

        const user = result.rows[0];

        // 2. BANDINGKAN PASSWORD (Input user vs Hash di Database)
        // bcrypt.compare akan mengembalikan true/false
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Username atau Password salah!" });
        }

        // 3. Kalau cocok, buat token
        const token = jwt.sign({ id: user.id, name: user.name }, SECRET_KEY, { expiresIn: '1h' });

        res.json({ message: "Login berhasil!", token: token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ... (Sisa Route books, borrow, return, history TETAP SAMA seperti sebelumnya) ...
// (Salin saja bagian bawah dari kode sebelumnya, tidak ada perubahan logika di sana)

// CONTOH UNTUK ROUTES LAIN (Dicopy biar lengkap)

// --- FITUR BARU: REGISTER (DAFTAR AKUN) ---
// Endpoint: POST /api/register
// Tidak perlu token (Public)
app.post('/api/register', async (req, res) => {
    const { name, username, password } = req.body;

    // 1. Validasi Input Kosong
    if (!name || !username || !password) {
        return res.status(400).json({ message: "Nama, Username, dan Password wajib diisi!" });
    }

    try {
        // 2. Cek apakah Username sudah ada di database
        const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ message: "Username sudah dipakai, cari yang lain!" });
        }

        // 3. Hash Password (Enkripsi)
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Masukkan ke Database
        const newUser = await pool.query(
            'INSERT INTO users (name, username, password) VALUES ($1, $2, $3) RETURNING id, name, username',
            [name, username, hashedPassword]
        );

        res.status(201).json({
            message: "Registrasi berhasil! Silakan login.",
            user: newUser.rows[0]
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FITUR BARU: UNREGISTER (HAPUS AKUN) ---
// Endpoint: DELETE /api/unregister
// Perlu Token (Protected) - User hanya bisa menghapus akunnya sendiri
app.delete('/api/unregister', authenticateToken, async (req, res) => {
    const userId = req.user.id; // Ambil ID dari token login

    try {
        // 1. Cek apakah User masih meminjam buku?
        // Kita tidak boleh menghapus user yang masih bawa buku perpustakaan!
        const activeLoan = await pool.query(
            "SELECT * FROM borrows WHERE user_id = $1 AND status = 'borrowed'", 
            [userId]
        );

        if (activeLoan.rows.length > 0) {
            return res.status(400).json({ 
                message: "Gagal hapus akun! Anda masih meminjam buku. Harap kembalikan dulu." 
            });
        }

        // 2. Hapus Riwayat Peminjaman (Opsional tapi penting untuk SQL)
        // Karena ada relasi (Foreign Key), biasanya kita harus hapus data di tabel 'borrows' dulu
        // sebelum menghapus data di tabel 'users'.
        await pool.query('DELETE FROM borrows WHERE user_id = $1', [userId]);

        // 3. Hapus User
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);

        res.json({ message: "Akun Anda berhasil dihapus. Sampai jumpa!" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// GET BOOKS (Pagination + Search + Exact Mode)
// Cara Pakai:
// 1. Partial: /api/books?page=1&search=ayam (Default)
// 2. Exact:   /api/books?page=1&search=ayam&exact=true
app.get('/api/books', async (req, res) => {
    // 1. Ambil Parameter
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;
    const offset = (page - 1) * limit;
    
    const search = req.query.search || ""; 
    const isExact = req.query.exact === 'true'; // Cek apakah mode Exact aktif?

    try {
        // Gunakan WHERE 1=1 agar fleksibel.
        // Trik: Jika sedang Search, kita tidak peduli stock. Jika tidak search, baru cek stock > 0.
        let query = 'SELECT * FROM books WHERE 1=1'; 
        let queryParams = [];
        
        // 2. LOGIKA PENCARIAN
        if (search) {
            // Tambahkan filter search ke Query
            // Kita pakai ILIKE agar huruf besar/kecil tidak masalah (Case Insensitive)
            query += ` AND (title ILIKE $1 OR author ILIKE $1)`;
            
            if (isExact) {
                // MODE EXACT: Tidak pakai tanda persen (%)
                // Judul harus "Ayam Goreng", tidak boleh "Ayam Goreng Enak"
                queryParams.push(search); 
            } else {
                // MODE PARTIAL: Pakai tanda persen (%)
                // Judul "Ayam" bisa ketemu "Sate Ayam"
                queryParams.push(`%${search}%`); 
            }
        } else {
            // Jika TIDAK mencari (List biasa), hanya tampilkan yang stoknya ada
            query += ` AND stock > 0`;
        }

        // Tambahkan Sorting Biar Rapi (A-Z)
        query += ` ORDER BY title ASC`;

        // 3. LOGIKA PAGINATION
        // Hitung urutan parameter ($1, $2, dst) secara dinamis
        const limitParamIndex = queryParams.length + 1;
        const offsetParamIndex = queryParams.length + 2;

        query += ` LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;
        
        // Masukkan angka limit dan offset ke array params
        queryParams.push(limit, offset);

        // 4. Jalankan Query
        const result = await pool.query(query, queryParams);

        res.json({
            status: "success",
            mode: search ? (isExact ? "search_exact" : "search_partial") : "list_all",
            page: page,
            limit: limit,
            total_found: result.rows.length,
            search_keyword: search,
            is_exact_match: isExact,
            data: result.rows
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/borrow', authenticateToken, async (req, res) => {
    const { bookId } = req.body;
    const userId = req.user.id;
    try {
        const bookCheck = await pool.query('SELECT * FROM books WHERE id = $1', [bookId]);
        if (bookCheck.rows.length === 0) return res.status(404).json({ message: "Buku tidak ada" });
        if (bookCheck.rows[0].stock <= 0) return res.status(400).json({ message: "Stok habis" });
        
        await pool.query('UPDATE books SET stock = stock - 1 WHERE id = $1', [bookId]);
        const insertBorrow = await pool.query(
            `INSERT INTO borrows (user_id, book_id, book_title, status) 
             VALUES ($1, $2, $3, 'borrowed') RETURNING *`,
            [userId, bookId, bookCheck.rows[0].title]
        );
        res.json({ message: "Berhasil pinjam!", data: insertBorrow.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/return', authenticateToken, async (req, res) => {
    const { bookId } = req.body;
    const userId = req.user.id;
    try {
        const borrowCheck = await pool.query(
            `SELECT * FROM borrows WHERE user_id = $1 AND book_id = $2 AND status = 'borrowed'`,
            [userId, bookId]
        );
        if (borrowCheck.rows.length === 0) return res.status(400).json({ message: "Data peminjaman tidak ditemukan." });

        await pool.query('UPDATE books SET stock = stock + 1 WHERE id = $1', [bookId]);
        const updateBorrow = await pool.query(
            `UPDATE borrows SET status = 'returned', return_date = NOW() 
             WHERE id = $1 RETURNING *`,
            [borrowCheck.rows[0].id]
        );
        res.json({ message: "Buku dikembalikan!", data: updateBorrow.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET HISTORY (Dengan Pagination)
// Cara pakai: /api/borrows?page=1
app.get('/api/borrows', authenticateToken, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;
    const offset = (page - 1) * limit;

    try {
        const result = await pool.query(
            'SELECT * FROM borrows ORDER BY borrow_date DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        res.json({
            status: "success",
            page: page,
            limit: limit,
            data: result.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server Secure Hashing berjalan di http://localhost:${port}`);
});