ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT '';

UPDATE users
SET nickname = substr(email, 1, instr(email, '@') - 1)
WHERE nickname = '';
