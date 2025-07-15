require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'db', // 'db' is the Docker service name
    port: process.env.DB_PORT || 3306,// 'db' matches the compose service name
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'your_strong_password_here',
    database: process.env.DB_NAME || 'image_storage',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create MySQL connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL database');
        connection.release();
        
        // Create images table if not exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL DEFAULT 'Untitled',
                image_path VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (err) {
        console.error('❌ MySQL connection error:', err.message);
        process.exit(1);
    }
}

// Initialize database connection
testConnection();

// Middleware
app.use(cors({
    origin: 'http://localhost:5174',
    credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage,
    fileFilter,
    limits: {
        fileSize: 1024 * 1024 * 5 // 5MB limit
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1');
        res.json({
            status: 'up',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.json({
            status: 'up',
            database: 'disconnected',
            timestamp: new Date().toISOString()
        });
    }
});

// Get all images
app.get('/api/images', async (req, res) => {
    try {
        const [images] = await pool.query(`
            SELECT 
                id,
                name,
                image_path AS imagePath,
                created_at AS createdAt
            FROM images
            ORDER BY created_at DESC
        `);
        
        // Convert dates to JavaScript Date objects
        const formattedImages = images.map(image => ({
            ...image,
            createdAt: new Date(image.createdAt)
        }));
        
        res.json(formattedImages);
    } catch (err) {
        console.error('Error fetching images:', err);
        res.status(500).json({ 
            message: 'Failed to fetch images',
            error: err.message 
        });
    }
});

// Upload image
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const imagePath = `uploads/${req.file.filename}`;
        const name = req.body.name || 'Untitled';
        
        const [result] = await pool.query(
            'INSERT INTO images (name, image_path) VALUES (?, ?)',
            [name, imagePath]
        );
        
        const [newImage] = await pool.query(`
            SELECT 
                id,
                name,
                image_path AS imagePath,
                created_at AS createdAt
            FROM images
            WHERE id = ?
        `, [result.insertId]);
        
        res.status(201).json({
            ...newImage[0],
            createdAt: new Date(newImage[0].createdAt)
        });

    } catch (err) {
        console.error('Upload error:', err);
        
        // Clean up uploaded file if there was an error saving to DB
        if (req.file) {
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting file:', unlinkErr);
            });
        }

        res.status(500).json({ 
            message: 'Upload failed',
            error: err.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ 
            message: 'File upload error',
            error: err.message 
        });
    }
    
    res.status(500).json({ 
        message: 'Something went wrong',
        error: err.message 
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📁 Upload directory: ${uploadDir}`);
});