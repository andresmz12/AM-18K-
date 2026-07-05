// Crea (o reutiliza) la cuenta de administrador de plataforma (superadmin).
// No existe endpoint público para esto — solo se crea desde este script,
// corriéndolo directamente en el servidor/entorno con acceso a la base de datos.
//
// Uso: node backend/scripts/create-superadmin.js "Nombre" correo@am18k.com contraseña
const { pool, init } = require('../database');
const { hashPassword } = require('../auth');

async function main() {
  const [nombre, email, password] = process.argv.slice(2);
  if (!nombre || !email || !password) {
    console.error('Uso: node create-superadmin.js "Nombre" correo@ejemplo.com contraseña');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('La contraseña debe tener al menos 6 caracteres');
    process.exit(1);
  }

  await init();

  const { rows: [empresa] } = await pool.query(
    `INSERT INTO empresas (nombre) VALUES ('AM 18K — Plataforma')
     ON CONFLICT DO NOTHING RETURNING id`
  );
  let empresaId = empresa?.id;
  if (!empresaId) {
    const { rows } = await pool.query(`SELECT id FROM empresas WHERE nombre = 'AM 18K — Plataforma' LIMIT 1`);
    empresaId = rows[0].id;
  }

  const password_hash = await hashPassword(password);
  await pool.query(
    `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, $4, 'superadmin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $4, rol = 'superadmin', activo = true`,
    [empresaId, nombre, email.toLowerCase(), password_hash]
  );

  console.log(`Superadmin listo: ${email}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
