const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());
const path = require('path');
app.use(express.static(__dirname));

const mongoUrl = process.env.MONGODB_URI || 'mongodb+srv://carbonuser:carbon123@cluster0.kre59xj.mongodb.net/?appName=Cluster0';
mongoose.connect(mongoUrl)
  .then(() => console.log(`MongoDB connected: ${mongoUrl}`))
  .catch((err) => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['buyer', 'seller', 'admin'], required: true },
  creditsBought: { type: Number, default: 0 },
  creditsSold: { type: Number, default: 0 },
  history: { type: [String], default: [] }
});

const creditSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  projectName: String,
  projectType: String,
  projectTypeLabel: String,
  impact: Number,
  credits: Number,
  owner: String,
  verificationFactor: Number,
  verified: Boolean,
  status: String,
  createdAt: Date,
  soldOut: { type: Boolean, default: false },
  hash: String
});

const ledgerSchema = new mongoose.Schema({
  timestamp: String,
  tx: String
});

const User = mongoose.model('User', userSchema);
const Credit = mongoose.model('Credit', creditSchema);
const Ledger = mongoose.model('Ledger', ledgerSchema);

// Optional seed for admin only, remove sample accounts to rely on real registration
const ensureSeed = async () => {
  const count = await User.countDocuments();
  if (count === 0) {
    await User.create([{ username: 'admin', password: 'admin123', role: 'admin' }]);
    console.log('Seeded admin user');
  }
};

ensureSeed().catch(console.error);

app.get('/api/state', async (req, res) => {
  const users = await User.find().lean();
  const creditPool = await Credit.find().lean();
  const ledger = await Ledger.find().lean();
  res.json({ users, creditPool, ledger });
});

app.put('/api/state', async (req, res) => {
  const { users: userPayload, creditPool, ledger: ledgerPayload } = req.body;
  if (!Array.isArray(userPayload) || !Array.isArray(creditPool) || !Array.isArray(ledgerPayload)) {
    return res.status(400).json({ error: 'Users, creditPool and ledger arrays required' });
  }

  // update or insert users
  await Promise.all(userPayload.map(async (u) => {
    if (!u.username) return;
    await User.findOneAndUpdate(
      { username: u.username },
      { $set: { role: u.role || 'buyer', creditsBought: u.creditsBought || 0, creditsSold: u.creditsSold || 0, history: u.history || [] } },
      { upsert: true, new: true }
    );
  }));

  // update or insert credits
  await Promise.all(creditPool.map(async (c) => {
    if (!c.id) return;
    await Credit.findOneAndUpdate(
      { id: c.id },
      { $set: {
        projectName: c.projectName,
        projectType: c.projectType,
        projectTypeLabel: c.projectTypeLabel,
        impact: c.impact,
        credits: c.credits,
        owner: c.owner,
        verificationFactor: c.verificationFactor,
        verified: c.verified,
        status: c.status,
        createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
        soldOut: c.soldOut || false,
        hash: c.hash || ''
      } },
      { upsert: true, new: true }
    );
  }));

  // optional: append ledger entries
  await Promise.all(ledgerPayload.map(async (entry) => {
    if (!entry || !entry.tx) return;
    await Ledger.create({ timestamp: entry.timestamp || new Date().toLocaleTimeString(), tx: entry.tx });
  }));

  res.json({ success: true });
});

app.post('/api/register', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username,password,role required' });
  }
  const normalizedUsername = username.trim().toLowerCase();
  const existing = await User.findOne({ username: normalizedUsername });
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const newUser = await User.create({ username: normalizedUsername, password, role, creditsBought: 0, creditsSold: 0, history: [] });
  res.json({ success: true, user: newUser });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username/password required' });
  }
  const normalizedUsername = username.trim().toLowerCase();
  const user = await User.findOne({ username: normalizedUsername });
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ success: true, user });
});

app.delete('/api/users/:username', async (req, res) => {
  const deletionActor = (req.body && req.body.actor) ? req.body.actor.toLowerCase() : null;
  const target = req.params.username ? req.params.username.toLowerCase() : null;

  if (!deletionActor || !target) {
    return res.status(400).json({ error: 'Missing actor or username' });
  }

  const actor = await User.findOne({ username: deletionActor });
  if (!actor || actor.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete accounts' });
  }

  if (target === 'admin') {
    return res.status(400).json({ error: 'Cannot delete admin account' });
  }

  const user = await User.findOne({ username: target });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if ((user.creditsBought || 0) !== 0 || (user.creditsSold || 0) !== 0) {
    return res.status(400).json({ error: 'Only accounts with zero activity can be deleted' });
  }

  await User.deleteOne({ username: target });
  await Ledger.create({ timestamp: new Date().toLocaleTimeString(), tx: `${deletionActor} deleted user ${target}` });

  res.json({ success: true });
});

app.post('/api/credits', async (req, res) => {
  const { projectName, projectType, impact, owner } = req.body;
  if (!projectName || !projectType || !impact || !owner) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const factor = parseFloat((0.85 + Math.random() * 0.15).toFixed(3));
  const credits = parseFloat((impact * factor).toFixed(2));
  const credit = await Credit.create({
    id: `CC-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`,
    projectName,
    projectType,
    projectTypeLabel: ({ tree_plantation: 'Tree Plantation', renewable_energy: 'Renewable Energy', waste_management: 'Waste Management', efficiency: 'Energy Efficiency' })[projectType] || 'Unknown',
    impact,
    credits,
    owner,
    verificationFactor: factor,
    verified: false,
    status: 'pending',
    createdAt: new Date(),
    soldOut: false
  });

  await User.findOneAndUpdate({ username: owner }, { $push: { history: `${new Date().toLocaleTimeString()} - Requested verification for ${projectName}.` } });
  await Ledger.create({ timestamp: new Date().toLocaleTimeString(), tx: `${owner} requested verification for ${projectName}` });

  res.json({ success: true, credit });
});

app.put('/api/credits/:id/purchase', async (req, res) => {
  const { id } = req.params;
  const { buyer, qty } = req.body;
  if (!buyer || !qty) return res.status(400).json({ error: 'Missing buyer or qty' });

  const credit = await Credit.findOne({ id });
  if (!credit || !credit.verified || credit.credits <= 0) return res.status(400).json({ error: 'Credit not available' });
  if (qty <= 0 || qty > credit.credits) return res.status(400).json({ error: 'Credits out of range' });

  credit.credits = Math.max(0, credit.credits - qty);
  if (credit.credits === 0) credit.soldOut = true;
  await credit.save();

  await User.findOneAndUpdate({ username: buyer }, {
    $inc: { creditsBought: qty },
    $push: { history: `${new Date().toLocaleTimeString()} - Bought ${qty} credits from ${credit.projectName}.` }
  });
  await User.findOneAndUpdate({ username: credit.owner }, {
    $inc: { creditsSold: qty },
    $push: { history: `${new Date().toLocaleTimeString()} - Sold ${qty} credits for ${credit.projectName}.` }
  });

  await Ledger.create({ timestamp: new Date().toLocaleTimeString(), tx: `${buyer} bought ${qty} credits from ${credit.projectName}` });

  res.json({ success: true, credit });
});

app.delete('/api/credits/:id', async (req, res) => {
  const { id } = req.params;
  const { actor } = req.body;
  if (!actor) return res.status(400).json({ error: 'Missing actor' });

  const credit = await Credit.findOne({ id });
  if (!credit) return res.status(404).json({ error: 'Not found' });

  const requestor = await User.findOne({ username: actor.toLowerCase() });
  if (!requestor || requestor.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete credit listings' });
  }

  if ((credit.credits || 0) > 0) {
    return res.status(400).json({ error: 'Only zero-balance credits can be deleted' });
  }

  await Credit.deleteOne({ id });
  await Ledger.create({ timestamp: new Date().toLocaleTimeString(), tx: `${actor} deleted ${credit.projectName}` });
  res.json({ success: true });
});

app.put('/api/credits/:id/verify', async (req, res) => {
  const { id } = req.params;
  const { action, admin } = req.body;
  if (!action || !admin) return res.status(400).json({ error: 'Missing action/admin' });

  const credit = await Credit.findOne({ id });
  if (!credit) return res.status(404).json({ error: 'Not found' });

  if (action === 'accept') {
    credit.status = 'verified';
    credit.verified = true;
    credit.hash = `block-${Math.abs(require('crypto').createHash('sha256').update(`${credit.id}-${Date.now()}`).digest('hex').substring(0, 8))}`;
    await credit.save();
    await Ledger.create({ timestamp: new Date().toLocaleTimeString(), tx: `${admin} verified ${credit.projectName}` });
  } else {
    credit.status = 'declined';
    await credit.save();
    await Ledger.create({ timestamp: new Date().toLocaleTimeString(), tx: `${admin} declined ${credit.projectName}` });
  }

  await User.findOneAndUpdate({ username: credit.owner }, { $push: { history: `${new Date().toLocaleTimeString()} - Verification ${credit.status} for ${credit.projectName}.` } });
  res.json({ success: true, credit });
});

app.listen(3000, () => {
  console.log('Carbon Credit backend running on http://localhost:3000');
});