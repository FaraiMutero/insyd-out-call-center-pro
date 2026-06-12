import jwt from "jsonwebtoken";

const accessMinutes = Number(process.env.JWT_ACCESS_TTL_MINUTES || 15);
const refreshDays = Number(process.env.JWT_REFRESH_TTL_DAYS || 7);
const secret = process.env.APP_SECRET || "dev-secret-change-me";

export const ACCESS_TOKEN_MS = accessMinutes * 60 * 1000;
export const REFRESH_TOKEN_MS = refreshDays * 24 * 60 * 60 * 1000;

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      status: user.status,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      typ: "access"
    },
    secret,
    { expiresIn: `${accessMinutes}m` }
  );
}

export function signRefreshToken({ userId, jti }) {
  return jwt.sign(
    {
      sub: String(userId),
      jti,
      typ: "refresh"
    },
    secret,
    { expiresIn: `${refreshDays}d` }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, secret);
}
