# Security tests

`schema.sql` is where the site's security actually lives: what a signed-out visitor can read,
who may post, what "anonymous" really hides. These scripts check those rules against a real
Postgres, so a future change to a policy cannot quietly open something up.

They need only `postgresql` locally — no Supabase account, no network:

```sh
initdb -D /tmp/pgdata -A trust -U postgres
pg_ctl -D /tmp/pgdata -o "-k /tmp -p 5599" start
createdb -h /tmp -p 5599 -U postgres kosher_test

psql -h /tmp -p 5599 -U postgres -d kosher_test -f supabase/tests/00_supabase_harness.sql
psql -h /tmp -p 5599 -U postgres -d kosher_test -f supabase/schema.sql
psql -h /tmp -p 5599 -U postgres -d kosher_test -f supabase/tests/01_security_test.sql
```

`01_security_test.sql` prints a numbered section per rule. The cases that are *supposed* to
fail say so in their heading — an `ERROR: new row violates row-level security policy` under
"expect: policy violation" is the test passing. What it covers:

1. A signed-in user can post a signed and an anonymous review
2. Nobody can post as another user
3. A banned user cannot post
4. Nobody can promote themselves to admin
5. Renaming yourself updates your signed bylines but not your anonymous ones
6. Signed-out visitors can read the public view but not the underlying table
7. Anonymous reviews expose no `user_id`, so they cannot be tied to a person's signed reviews
8. One signed-in user cannot read another's rows from the table
9. Hiding a review removes it from the public view while the owner and admins still see it
10. Scores outside 1–5 are rejected
11. Photo uploads are confined to the uploader's own folder
12. `author_name` cannot be spoofed by writing it directly

The last one matters: bylines are set by a database trigger, not by the browser, so a crafted
API call cannot post under someone else's name.
