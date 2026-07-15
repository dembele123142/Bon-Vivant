const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bonvivant2024';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const IMAGE_BUCKET = 'product-images';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[aviso] ADMIN_PASSWORD não definida — usando senha padrão insegura. Defina a variável de ambiente em produção.');
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[erro] SUPABASE_URL e/ou SUPABASE_SERVICE_KEY não definidas. Defina essas variáveis de ambiente antes de iniciar o servidor.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

// ---------- helpers de conversão (snake_case do banco <-> camelCase da API) ----------
function toApiProduct(row) {
  return {
    id: row.id,
    name: row.name,
    material: row.material,
    category: row.category,
    price: Number(row.price),
    originalPrice: Number(row.original_price),
    image: row.image,
    letter: row.letter,
    featured: row.featured,
  };
}

// ---------- upload de imagens (memória, depois vai pro Supabase Storage) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Formato de imagem inválido (use JPG, PNG ou WEBP)'), ok);
  },
});

async function uploadImage(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(filename, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

async function deleteImageIfSupabase(imageUrl) {
  if (!imageUrl || !imageUrl.includes(`/${IMAGE_BUCKET}/`)) return; // não mexe em imagens locais do repositório (ex: images/foo.jpg)
  const filename = imageUrl.split(`/${IMAGE_BUCKET}/`).pop();
  if (filename) await supabase.storage.from(IMAGE_BUCKET).remove([filename]);
}

app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

// atalho: /admin também abre o painel (além de /admin.html)
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ---------- rotas públicas ----------
app.get('/api/products', async (req, res) => {
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(toApiProduct));
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
app.post('/api/admin/products', requireAuth, upload.single('imageFile'), async (req, res) => {
  try {
    const body = req.body;
    const id = (body.name || 'produto')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + crypto.randomBytes(3).toString('hex');

    let imageUrl = null;
    if (req.file) imageUrl = await uploadImage(req.file);

    const row = {
      id,
      name: body.name || 'Novo produto',
      material: body.material || '',
      category: body.category || 'cordao',
      price: Number(body.price) || 0,
      original_price: Number(body.originalPrice) || Number(body.price) || 0,
      image: imageUrl,
      letter: (body.name || 'P').trim().charAt(0).toUpperCase(),
      featured: body.featured === 'true' || body.featured === true,
    };

    const { data, error } = await supabase.from('products').insert(row).select().single();
    if (error) throw error;
    res.status(201).json(toApiProduct(data));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Erro ao criar produto' });
  }
});

app.put('/api/admin/products/:id', requireAuth, upload.single('imageFile'), async (req, res) => {
  try {
    const { data: existing, error: findErr } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    if (findErr || !existing) return res.status(404).json({ error: 'Produto não encontrado' });

    const body = req.body;
    const update = {
      name: body.name ?? existing.name,
      material: body.material ?? existing.material,
      category: body.category ?? existing.category,
      price: body.price !== undefined ? Number(body.price) : existing.price,
      original_price: body.originalPrice !== undefined ? Number(body.originalPrice) : existing.original_price,
      featured: body.featured !== undefined ? (body.featured === 'true' || body.featured === true) : existing.featured,
    };
    update.letter = (update.name || 'P').trim().charAt(0).toUpperCase();

    if (req.file) {
      await deleteImageIfSupabase(existing.image);
      update.image = await uploadImage(req.file);
    }

    const { data, error } = await supabase.from('products').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(toApiProduct(data));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Erro ao atualizar produto' });
  }
});

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    const { data: existing } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) throw error;
    if (existing) await deleteImageIfSupabase(existing.image);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Erro ao excluir produto' });
  }
});

// tratamento de erro do multer/upload
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Erro no upload' });
  next();
});

app.listen(PORT, () => {
  console.log(`Bon Vivant Joias rodando em http://localhost:${PORT}`);
});
