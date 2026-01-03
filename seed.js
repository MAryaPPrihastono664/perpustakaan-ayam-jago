require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs'); // Panggil library hash

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function seedData() {
    try {
        console.log("⏳ Memulai proses transfer data ke Neon (dengan Hashing)...");

        // 1. Reset Tabel
        await pool.query(`DROP TABLE IF EXISTS borrows;`);
        await pool.query(`DROP TABLE IF EXISTS books;`);
        await pool.query(`DROP TABLE IF EXISTS users;`);

        // 2. Buat Tabel
        await pool.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                username VARCHAR(50) UNIQUE,
                password VARCHAR(255)  -- Ubah jadi 255 karena hasil hash panjang
            );
        `);

        await pool.query(`
            CREATE TABLE books (
                id SERIAL PRIMARY KEY,
                title VARCHAR(100),
                author VARCHAR(100),
                stock INTEGER
            );
        `);

        await pool.query(`
            CREATE TABLE borrows (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                book_id INTEGER REFERENCES books(id),
                book_title VARCHAR(100),
                status VARCHAR(20),
                borrow_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                return_date TIMESTAMP
            );
        `);

        // 3. SIAPKAN PASSWORD YANG SUDAH DI-HASH
        // Angka 10 adalah "salt rounds" (tingkat kerumitan enkripsi)
        const passwordBudi = await bcrypt.hash('123', 10);
        const passwordSiti = await bcrypt.hash('456', 10);
        const passwordUdin = await bcrypt.hash('789', 10);

        // 4. INSERT DATA (Pakai password yang sudah di-hash)
        await pool.query(`
            INSERT INTO users (name, username, password) VALUES 
            ('Budi Petarung', 'budi', '${passwordBudi}'),
            ('Siti Jagoan', 'siti', '${passwordSiti}'),
            ('Udin Jalu', 'udin', '${passwordUdin}');
        `);

        await pool.query(`
            INSERT INTO books (title, author, stock) VALUES 
            ('Cara Merawat Ayam Jago', 'Bapak Jago', 2),
            ('Filosofi Berkokok', 'Dr. Chicken', 1),
            ('Rahasia Pakan Juara', 'Chef Jago', 0),
            ('Sejarah Ayam di Indonesia', 'Prof. Unggas', 5);
        `);

        console.log("✅ Berhasil! Database Neon sudah di-update dengan password terenkripsi.");
    } catch (err) {
        console.error("❌ Gagal:", err);
    } finally {
        pool.end();
    }
}

seedData();