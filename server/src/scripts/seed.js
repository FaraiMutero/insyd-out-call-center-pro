import bcrypt from "bcryptjs";
import { runMigrations } from "../db/migrate.js";
import { getUserByEmail, createUser } from "../db/usersRepository.js";

async function upsertUser({ email, firstName, lastName, role, status }) {
  if (getUserByEmail(email)) {
    return;
  }

  const passwordHash = await bcrypt.hash("Passw0rd123", 12);
  createUser({
    email,
    passwordHash,
    firstName,
    lastName,
    role,
    status
  });
}

async function seed() {
  runMigrations();

  await upsertUser({
    email: "admin@insydout.local",
    firstName: "System",
    lastName: "Admin",
    role: "admin",
    status: "active"
  });

  await upsertUser({
    email: "manager@insydout.local",
    firstName: "Mina",
    lastName: "Manager",
    role: "manager",
    status: "active"
  });

  await upsertUser({
    email: "qa@insydout.local",
    firstName: "Qana",
    lastName: "Analyst",
    role: "qa",
    status: "active"
  });

  await upsertUser({
    email: "agent@insydout.local",
    firstName: "Ayo",
    lastName: "Agent",
    role: "agent",
    status: "active"
  });

  console.log("Seed complete. Default password for all users: Passw0rd123");
}

seed();
