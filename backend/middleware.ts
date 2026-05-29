import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: {
    walletAddress: string;
    userId: string;
  };
}

export function middleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid token format" });
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Unauthorized: Token missing" });
    return;
  }

  try {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      console.error("JWT Secret is missing in env configurations");
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as any;
    
    // Support claims structure from either standard Supabase Auth JWT or custom-signed JWT
    const walletAddress = decoded.wallet_address || decoded.user_metadata?.wallet_address || "";
    const userId = decoded.sub || "";

    if (!walletAddress || !userId) {
      res.status(401).json({ error: "Unauthorized: Invalid token claims" });
      return;
    }

    (req as AuthenticatedRequest).user = {
      walletAddress,
      userId
    };

    next();
  } catch (error) {
    res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}