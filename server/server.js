import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { pool, initDb } from './db.js';
import { requireAuth, signToken } from './auth.js';
import { buildInsights, anomalyScore } from './insights.js';

dotenv.config();
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

const monthStart = (value = new Date()) => {
  const d = new Date(value);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01`;
};

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 8) return res.status(400).json({ error: 'Name, email and an 8+ character password are required.' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email', [name.trim(), email.toLowerCase().trim(), hash]);
    const user = rows[0];
    await pool.query('INSERT INTO accounts(user_id,name,type,opening_balance) VALUES($1,$2,$3,$4)', [user.id, 'Main account', 'checking', 0]);
    res.status(201).json({ token: signToken(user), user });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email is already registered.' });
    console.error(e); res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase().trim()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });
  res.json({ token: signToken(user), user: { id:user.id, name:user.name, email:user.email } });
});

app.get('/api/me', requireAuth, async (req,res) => {
  const { rows } = await pool.query('SELECT id,name,email,created_at FROM users WHERE id=$1', [req.user.id]);
  res.json(rows[0]);
});

app.get('/api/accounts', requireAuth, async (req,res) => {
  const { rows } = await pool.query(`SELECT a.*, COALESCE(a.opening_balance + SUM(t.amount), a.opening_balance)::float AS balance
    FROM accounts a LEFT JOIN transactions t ON t.account_id=a.id WHERE a.user_id=$1 GROUP BY a.id ORDER BY a.id`, [req.user.id]);
  res.json(rows);
});
app.post('/api/accounts', requireAuth, async (req,res) => {
  const {name,type='checking',opening_balance=0}=req.body;
  const {rows}=await pool.query('INSERT INTO accounts(user_id,name,type,opening_balance) VALUES($1,$2,$3,$4) RETURNING *',[req.user.id,name,type,Number(opening_balance)||0]);
  res.status(201).json(rows[0]);
});

app.get('/api/transactions', requireAuth, async (req,res) => {
  const { rows } = await pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY transaction_date DESC, id DESC LIMIT 500', [req.user.id]);
  res.json(rows);
});
app.post('/api/transactions', requireAuth, async (req,res) => {
  const { account_id, merchant, category='Other', amount, transaction_date, notes='' }=req.body;
  if (!merchant || !amount) return res.status(400).json({error:'Merchant and amount are required.'});
  if (account_id) {
    const own=await pool.query('SELECT 1 FROM accounts WHERE id=$1 AND user_id=$2',[account_id,req.user.id]);
    if(!own.rowCount) return res.status(403).json({error:'Invalid account.'});
  }
  const history=(await pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY transaction_date DESC LIMIT 200',[req.user.id])).rows;
  const {rows}=await pool.query(`INSERT INTO transactions(user_id,account_id,merchant,category,amount,transaction_date,notes)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[req.user.id,account_id||null,merchant,category,Number(amount),transaction_date||new Date().toISOString().slice(0,10),notes]);
  res.status(201).json({...rows[0], anomaly: anomalyScore(rows[0], history)});
});
app.put('/api/transactions/:id', requireAuth, async (req,res) => {
  const {merchant,category,amount,transaction_date,notes,account_id}=req.body;
  const {rows}=await pool.query(`UPDATE transactions SET merchant=$1,category=$2,amount=$3,transaction_date=$4,notes=$5,account_id=$6
    WHERE id=$7 AND user_id=$8 RETURNING *`,[merchant,category,Number(amount),transaction_date,notes||'',account_id||null,req.params.id,req.user.id]);
  if(!rows[0]) return res.status(404).json({error:'Transaction not found.'}); res.json(rows[0]);
});
app.delete('/api/transactions/:id', requireAuth, async (req,res) => {
  const result=await pool.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
  res.status(result.rowCount?204:404).end();
});

app.get('/api/budgets', requireAuth, async (req,res) => {
  const month=req.query.month || monthStart();
  const {rows}=await pool.query('SELECT * FROM budgets WHERE user_id=$1 AND month=$2 ORDER BY category',[req.user.id,month]);
  res.json(rows);
});
app.post('/api/budgets', requireAuth, async (req,res) => {
  const {category,amount,month=monthStart()}=req.body;
  const {rows}=await pool.query(`INSERT INTO budgets(user_id,category,amount,month) VALUES($1,$2,$3,$4)
    ON CONFLICT(user_id,category,month) DO UPDATE SET amount=EXCLUDED.amount RETURNING *`,[req.user.id,category,Number(amount),month]);
  res.status(201).json(rows[0]);
});
app.delete('/api/budgets/:id', requireAuth, async (req,res)=>{ await pool.query('DELETE FROM budgets WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]); res.status(204).end(); });

app.get('/api/goals', requireAuth, async (req,res)=>{ const {rows}=await pool.query('SELECT * FROM goals WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]); res.json(rows); });
app.post('/api/goals', requireAuth, async (req,res)=>{ const {name,target_amount,current_amount=0,target_date=null}=req.body; const {rows}=await pool.query('INSERT INTO goals(user_id,name,target_amount,current_amount,target_date) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.user.id,name,Number(target_amount),Number(current_amount),target_date]); res.status(201).json(rows[0]); });
app.put('/api/goals/:id', requireAuth, async (req,res)=>{ const {name,target_amount,current_amount,target_date}=req.body; const {rows}=await pool.query('UPDATE goals SET name=$1,target_amount=$2,current_amount=$3,target_date=$4 WHERE id=$5 AND user_id=$6 RETURNING *',[name,Number(target_amount),Number(current_amount),target_date||null,req.params.id,req.user.id]); res.json(rows[0]); });
app.delete('/api/goals/:id', requireAuth, async (req,res)=>{ await pool.query('DELETE FROM goals WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]); res.status(204).end(); });

app.get('/api/subscriptions', requireAuth, async (req,res)=>{ const {rows}=await pool.query('SELECT * FROM subscriptions WHERE user_id=$1 ORDER BY active DESC,next_due_date',[req.user.id]); res.json(rows); });
app.post('/api/subscriptions', requireAuth, async (req,res)=>{ const {merchant,amount,cadence='monthly',next_due_date=null}=req.body; const {rows}=await pool.query('INSERT INTO subscriptions(user_id,merchant,amount,cadence,next_due_date) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.user.id,merchant,Number(amount),cadence,next_due_date]); res.status(201).json(rows[0]); });
app.delete('/api/subscriptions/:id', requireAuth, async (req,res)=>{ await pool.query('DELETE FROM subscriptions WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]); res.status(204).end(); });

app.post('/api/import/csv', requireAuth, upload.single('file'), async (req,res) => {
  if(!req.file) return res.status(400).json({error:'CSV file required.'});
  const lines=req.file.buffer.toString('utf8').split(/\r?\n/).filter(Boolean);
  if(lines.length<2) return res.status(400).json({error:'CSV has no rows.'});
  const headers=lines[0].split(',').map(h=>h.trim().toLowerCase());
  const idx=(name)=>headers.indexOf(name);
  if(idx('merchant')<0 || idx('amount')<0) return res.status(400).json({error:'CSV needs merchant and amount columns. Optional: category,date,account_id,notes.'});
  let imported=0;
  for(const line of lines.slice(1,201)) {
    const cols=line.split(',').map(v=>v.trim().replace(/^"|"$/g,''));
    const merchant=cols[idx('merchant')]; const amount=Number(cols[idx('amount')]);
    if(!merchant || !Number.isFinite(amount)) continue;
    const category=idx('category')>=0 ? cols[idx('category')] || 'Other' : 'Other';
    const date=idx('date')>=0 ? cols[idx('date')] || new Date().toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
    const notes=idx('notes')>=0 ? cols[idx('notes')] || '' : '';
    await pool.query('INSERT INTO transactions(user_id,merchant,category,amount,transaction_date,notes) VALUES($1,$2,$3,$4,$5,$6)',[req.user.id,merchant,category,amount,date,notes]);
    imported++;
  }
  res.json({ imported });
});

app.get('/api/dashboard', requireAuth, async (req,res) => {
  const month=req.query.month || monthStart();
  const next=new Date(`${month}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth()+1);
  const end=next.toISOString().slice(0,10);
  const tx=(await pool.query('SELECT * FROM transactions WHERE user_id=$1 AND transaction_date >= $2 AND transaction_date < $3 ORDER BY transaction_date DESC',[req.user.id,month,end])).rows;
  const budgets=(await pool.query('SELECT * FROM budgets WHERE user_id=$1 AND month=$2',[req.user.id,month])).rows;
  const accounts=(await pool.query(`SELECT a.id,a.name,a.type,(a.opening_balance+COALESCE(SUM(t.amount),0))::float balance FROM accounts a LEFT JOIN transactions t ON t.account_id=a.id WHERE a.user_id=$1 GROUP BY a.id ORDER BY a.id`,[req.user.id])).rows;
  const totalBudget=budgets.reduce((s,b)=>s+Number(b.amount),0);
  const insight=buildInsights(tx,totalBudget);
  const categorySpent={}; tx.filter(t=>Number(t.amount)<0).forEach(t=>categorySpent[t.category]=(categorySpent[t.category]||0)+Math.abs(Number(t.amount)));
  res.json({ month, transactions:tx, budgets, accounts, totalBudget, totalSpent:insight.totalSpent, categorySpent, insights:insight });
});

const port=Number(process.env.PORT||4000);
initDb().then(()=>app.listen(port,()=>console.log(`Bloom API running on http://localhost:${port}`))).catch(err=>{console.error('Database startup failed:',err.message);process.exit(1)});
