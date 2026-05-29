import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import jwt from 'jsonwebtoken';
import { middleware, type AuthenticatedRequest } from './middleware.ts';
import { supabase } from './db.ts';

const app = express();

app.use(express.json());
app.use(cors());

// Temporary in-memory storage for auth nonces (expires in 5 minutes)
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

// Clean up expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of nonceStore.entries()) {
    if (value.expiresAt < now) {
      nonceStore.delete(key);
    }
  }
}, 60000);

// Nonce generation endpoint
app.get('/auth/nonce', (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: 'walletAddress query parameter is required' });
    return;
  }

  try {
    // Validate public key format
    new PublicKey(walletAddress);
  } catch (err) {
    res.status(400).json({ error: 'Invalid Solana wallet address' });
    return;
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiration

  nonceStore.set(walletAddress.toLowerCase(), { nonce, expiresAt });

  res.json({ nonce });
});

// Login and token generation endpoint
app.post('/auth/login', async (req, res) => {
  const { walletAddress, signature, message } = req.body;

  if (!walletAddress || !signature || !message) {
    res.status(400).json({ error: 'walletAddress, signature, and message are required' });
    return;
  }

  const normalizedWallet = walletAddress.toLowerCase();
  const storedNonceObj = nonceStore.get(normalizedWallet);

  if (!storedNonceObj || storedNonceObj.expiresAt < Date.now()) {
    res.status(400).json({ error: 'Nonce expired or not found. Please request a new nonce.' });
    return;
  }

  const expectedMessage = `Sign this message to authenticate with Prediction Market: ${storedNonceObj.nonce}`;
  if (message !== expectedMessage) {
    res.status(400).json({ error: 'Message content mismatch. Verification failed.' });
    return;
  }

  try {
    // Verify signature
    const signatureBuffer = Buffer.from(signature, 'hex');
    const messageBuffer = new TextEncoder().encode(message);
    const publicKeyObj = new PublicKey(walletAddress);

    const isVerified = nacl.sign.detached.verify(
      messageBuffer,
      signatureBuffer,
      publicKeyObj.toBytes()
    );

    if (!isVerified) {
      res.status(401).json({ error: 'Signature verification failed' });
      return;
    }

    // Nonce is verified, remove it
    nonceStore.delete(normalizedWallet);

    const email = `${normalizedWallet}@solana.auth`;
    let user: any = null;

    // Check if user already exists in Supabase
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('Error listing Supabase users:', listError);
      res.status(500).json({ error: 'Database verification failed' });
      return;
    }

    if (usersData?.users) {
      user = usersData.users.find((u: any) => u.email === email);
    }

    // Create user if not exists
    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { wallet_address: walletAddress }
      });

      if (createError) {
        console.error('Error creating Supabase user:', createError);
        res.status(500).json({ error: 'Registration failed' });
        return;
      }
      user = newUser.user;
    }

    // Generate JWT signed with Supabase JWT Secret
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      console.error('SUPABASE_JWT_SECRET is missing');
      res.status(500).json({ error: 'Auth configuration error' });
      return;
    }

    const payload = {
      aud: 'authenticated',
      role: 'authenticated',
      sub: user.id,
      email: user.email,
      app_metadata: {
        provider: 'solana',
        providers: ['solana']
      },
      user_metadata: {
        wallet_address: walletAddress
      }
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '24h' });

    res.json({
      token,
      user: {
        id: user.id,
        walletAddress: walletAddress
      }
    });

  } catch (error: any) {
    console.error('Auth handler error:', error);
    res.status(500).json({ error: error.message || 'Authentication failed' });
  }
});

// Protected Prediction Market endpoints
app.post('/buy', middleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json({ message: 'Buy transaction processed successfully', user });
});

app.post('/sell', middleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json({ message: 'Sell transaction processed successfully', user });
});

app.post('/split', middleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json({ message: 'Split transaction processed successfully', user });
});

app.post('/merge', middleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json({ message: 'Merge transaction processed successfully', user });
});

app.get('/balance', middleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json({ balance: 1000, user });
});

app.get('/positions', middleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json({ positions: [], user });
});

app.get('/history', middleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json({ history: [], user });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});