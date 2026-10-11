import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

// Each test file gets a fresh database with every migration applied.
// Needs a Postgres with pgvector; TEST_DATABASE_URL points at its admin db.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/postgres";

export async function createTestDatabase() {
  const name = `test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), { max: 4, onnotice: () => {} });

  await sql.unsafe(await readFile(path.join(__dirname, "supabase-stubs.sql"), "utf8"));
  const dir = path.join(__dirname, "../../supabase/migrations");
  for (const file of (await readdir(dir)).sort()) {
    await sql.unsafe(await readFile(path.join(dir, file), "utf8"));
  }

  return {
    sql,
    async drop() {
      await sql.end();
      const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}

export async function createUser(sql: postgres.Sql, email: string, role: "owner" | "student" = "owner") {
  const [user] = await sql<{ id: string }[]>`
    insert into auth.users (email, raw_user_meta_data) values (${email}, ${sql.json({ confirmed_13_plus: true })}) returning id`;
  await sql`update profiles set role = ${role} where id = ${user.id}`;
  return user.id;
}
