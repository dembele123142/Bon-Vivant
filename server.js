const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bonvivant2024';
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const IMAGES_DIR = path.join(__dirname, 'images');

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[aviso] ADMIN_PASSWORD não definida — usando senha padrão insegura. Defina a variável de ambiente em produção.');
}

// ---------- sessões simples em memória ----------
const sessions = new Set();
function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.add(token);
  return token;
}
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.bv_session;
  if (token && sessions.has(token)) return next();
  return res.status(401).json({ error: 'Não autenticado' });
}

// ---------- persistência de produtos (arquivo JSON) ----------
function readProducts() {
  const raw = fs.readFileSync(PRODUCTS_FILE, 'utf-8');
  return JSON.parse(raw);
}
function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
}

// ---------- upload de imagens ----------
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Formato de imagem inválido (use JPG, PNG ou WEBP)'), ok);
  },
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

// ---------- rotas públicas ----------
app.get('/api/products', (req, res) => {
  res.json(readProducts());
});

// ---------- autenticação admin ----------
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  const token = createSession();
  res.cookie('bv_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12, // 12h
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.cookies && req.cookies.bv_session;
  if (token) sessions.delete(token);
  res.clearCookie('bv_session');
  res.json({ ok: true });
});

app.get('/api/admin/check', (req, res) => {
  const token = req.cookies && req.cookies.bv_session;
  res.json({ authenticated: !!(token && sessions.has(token)) });
});

// ---------- CRUD de produtos (protegido) ----------
app.post('/api/admin/products', requireAuth, upload.single('imageFile'), (req, res) => {
  const products = readProducts();
  const body = req.body;
  const id = (body.name || 'produto')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + crypto.randomBytes(3).toString('hex');

  const product = {
    id,
    name: body.name || 'Novo produto',
    material: body.material || '',
    category: body.category || 'cordao',
    price: Number(body.price) || 0,
    originalPrice: Number(body.originalPrice) || Number(body.price) || 0,
    image: req.file ? `images/${req.file.filename}` : null,
    letter: (body.name || 'P').trim().charAt(0).toUpperCase(),
    featured: body.featured === 'true' || body.featured === true,
  };
  products.push(product);
  writeProducts(products);
  res.status(201).json(product);
});

app.put('/api/admin/products/:id', requireAuth, upload.single('imageFile'), (req, res) => {
  const products = readProducts();
  const idx = products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });

  const body = req.body;
  const existing = products[idx];
  const updated = {
    ...existing,
    name: body.name ?? existing.name,
    material: body.material ?? existing.material,
    category: body.category ?? existing.category,
    price: body.price !== undefined ? Number(body.price) : existing.price,
    originalPrice: body.originalPrice !== undefined ? Number(body.originalPrice) : existing.originalPrice,
    featured: body.featured !== undefined ? (body.featured === 'true' || body.featured === true) : existing.featured,
    letter: ((body.name ?? existing.name) || 'P').trim().charAt(0).toUpperCase(),
  };
  if (req.file) {
    // remove imagem antiga do disco, se existir e for local
    if (existing.image && existing.image.startsWith('images/')) {
      const oldPath = path.join(__dirname, existing.image);
      fs.unlink(oldPath, () => {});
    }
    updated.image = `images/${req.file.filename}`;
  }
  products[idx] = updated;
  writeProducts(products);
  res.json(updated);
});

app.delete('/api/admin/products/:id', requireAuth, (req, res) => {
  const products = readProducts();
  const idx = products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });
  const [removed] = products.splice(idx, 1);
  writeProducts(products);
  if (removed.image && removed.image.startsWith('images/')) {
    fs.unlink(path.join(__dirname, removed.image), () => {});
  }
  res.json({ ok: true });
});

// tratamento de erro do multer/upload
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Erro no upload' });
  next();
});

app.listen(PORT, () => {
  console.log(`Bon Vivant Joias rodando em http://localhost:${PORT}`);
});
