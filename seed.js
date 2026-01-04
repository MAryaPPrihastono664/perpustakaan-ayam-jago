require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Fungsi bantu untuk membaca baris CSV dengan benar (menangani koma di dalam kutip)
function parseCSVLine(text) {
    // Regex sakti untuk memisahkan koma tapi mengabaikan koma di dalam tanda kutip "..."
    const re_valid = /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;
    const re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    
    // Return array of values
    const a = [];
    text.replace(re_value, 
        function(m0, m1, m2, m3) {
            // Hapus kutip ganda jika ada, dan perbaiki format quote CSV ("" jadi ")
            if      (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
            else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"').replace(/""/g, '"'));
            else if (m3 !== undefined) a.push(m3);
            return '';
        });
    
    // Handle kasus khusus delimiter koma
    if (/,\s*$/.test(text)) a.push('');
    return a;
}

async function seedData() {
    try {
        console.log("⏳ Memulai proses transfer data ke Neon (dengan CSV Goodreads)...");

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
                password VARCHAR(255)
            );
        `);

        await pool.query(`
            CREATE TABLE books (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255), -- Diperpanjang jaga-jaga judul panjang
                author VARCHAR(255),
                stock INTEGER
            );
        `);

        await pool.query(`
            CREATE TABLE borrows (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                book_id INTEGER REFERENCES books(id),
                book_title VARCHAR(255),
                status VARCHAR(20),
                borrow_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                return_date TIMESTAMP
            );
        `);

        // 3. SEED USERS (Akun Dummy)
        const passwordBudi = await bcrypt.hash('123', 10);
        const passwordSiti = await bcrypt.hash('456', 10);
        const passwordUdin = await bcrypt.hash('789', 10);

        await pool.query(`
            INSERT INTO users (name, username, password) VALUES 
            ('Budi Petarung', 'budi', '${passwordBudi}'),
            ('Siti Jagoan', 'siti', '${passwordSiti}'),
            ('Udin Jalu', 'udin', '${passwordUdin}');
        `);
        console.log("✅ User dummy berhasil dibuat.");

        // 4. BACA & INSERT CSV
        const csvPath = path.join(__dirname, 'goodreads_library_export.csv');
        
        // Baca file
        if (fs.existsSync(csvPath)) {
            const data = fs.readFileSync(csvPath, 'utf8');
            const lines = data.split('\n'); // Pisah per baris

            console.log(`📚 Ditemukan ${lines.length} baris di CSV. Sedang memproses...`);

            let successCount = 0;

            // Loop dari index 1 (karena index 0 adalah Header: Book Id, Title, Author...)
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue; // Skip baris kosong

                // Gunakan fungsi parse khusus agar koma dalam judul aman
                const columns = parseCSVLine(line);

                // Pastikan kolom ada isinya. 
                // Di CSV Goodreads: Index 1 = Title, Index 2 = Author
                const title = columns[1];
                const author = columns[2];
                
                // Random stock 1 - 5
                const stock = Math.floor(Math.random() * 5) + 1;

                if (title && author) {
                    // Gunakan Parameterized Query ($1, $2) agar aman dari error kutip (')
                    await pool.query(
                        'INSERT INTO books (title, author, stock) VALUES ($1, $2, $3)',
                        [title, author, stock]
                    );
                    successCount++;
                }
            }
            console.log(`✅ Berhasil memasukkan ${successCount} buku dari CSV!`);
        
        } else {
            console.error("❌ File 'goodreads_library_export.csv' tidak ditemukan!");
            // Fallback: Masukkan buku manual jika CSV tidak ada
            await pool.query(`
                INSERT INTO books (title, author, stock) VALUES 
                ('Cara Merawat Ayam Jago', 'Bapak Jago', 2);
            `);
        }

        console.log("🎉 SEEDING SELESAI!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Terjadi Error:", err);
        process.exit(1);
    }
}

seedData();