import { verifyToken } from "../auth/jwt.js";
import { getUserById, publicUser } from "../db/usersRepository.js";

function parseBearer(headerValue) {
  if (!headerValue) {
    return null;
  }
  const [scheme, token] = headerValue.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

export function requireAuth(req, res, next) {
  const headerToken = parseBearer(req.headers.authorization);
  const queryToken = typeof req.query?.token === "string" ? req.query.token : null;
  const token = headerToken || queryToken;
  if (!token) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Missing access token" });
  }

  try {
    const payload = verifyToken(token);
    if (payload.typ !== "access") {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid token type" });
    }

    const user = getUserById(Number(payload.sub));
    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "User not found" });
    }

    if (user.status === "pending") {
      return res.status(403).json({ error: "ACCOUNT_PENDING", message: "Account is awaiting approval" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ error: "ACCOUNT_INACTIVE", message: "Account is not active" });
    }

    req.user = publicUser(user);
    return next();
  } catch {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
}

export function requireRole(...allowedRoles) {
  const roles = allowedRoles.length === 1 && Array.isArray(allowedRoles[0]) ? allowedRoles[0] : allowedRoles;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    return next();
  };
}
