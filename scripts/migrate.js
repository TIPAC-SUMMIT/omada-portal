#!/usr/bin/env node
/**
 * scripts/migrate.js
 * Applies SQL migrations to Supabase in order.
 * Usage: node scripts/migrate.js
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MIGRATIONS_DIR = path.join(__dirname, '../supabase/migrations')

async function runMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    console.log(`Running migration: ${file}`)
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    const { error } = await supabase.rpc('exec_sql', { sql })
    if (error) {
      console.error(`Migration failed: ${file}`, error)
      // For initial setup, use Supabase dashboard SQL editor instead
      console.log('Tip: Run migrations directly in Supabase SQL editor for initial setup.')
      process.exit(1)
    }
    console.log(`✓ ${file}`)
  }
}

runMigrations().catch(console.error)
