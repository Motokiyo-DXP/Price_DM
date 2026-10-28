import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../app/decks/actions.ts', import.meta.url), 'utf8');
const action = source.slice(source.indexOf('export async function getOrCreateDeckShareTokenAction('), source.indexOf('export async function importSharedDeckAction('));
const js = ts.transpile(action.replace('export ', ''), { target: ts.ScriptTarget.ES2022 });
const id = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';

function fixture({ visibility = 'private', owned = true, authenticated = true, tokenError = false, publishError = false } = {}) {
  const calls = [], paths = [];
  let current = visibility;
  const supabase = {
    from(table) {
      let update = null;
      const filters = [];
      const query = {
        select() { return query; },
        update(value) { update = value; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        async maybeSingle() {
          calls.push({ table, update, filters });
          assert.deepEqual(filters, [['id', id], ['owner_id', 'owner']]);
          if (!owned || (update && publishError)) return { data: null, error: null };
          if (update) current = update.visibility;
          return { data: update ? { id } : { visibility: current }, error: null };
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      assert.equal(name, 'get_or_create_deck_share_token');
      assert.deepEqual(args, { p_deck_id: id });
      return { data: tokenError ? null : token, error: tokenError ? new Error('failure') : null };
    },
  };
  const run = new Function('authenticatedClient', 'isShareUuid', 'revalidatePath', js + '; return getOrCreateDeckShareTokenAction;')(
    async () => authenticated ? { supabase, userId: 'owner' } : null,
    value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value),
    path => paths.push(path),
  );
  return { run, calls, paths, visibility: () => current };
}

test('private and unlisted sharing require explicit confirmation without token creation or writes', async () => {
  for (const visibility of ['private', 'unlisted']) {
    const f = fixture({ visibility });
    assert.deepEqual(await f.run(id), { status: 'confirmation-required' });
    assert.equal(f.calls.length, 1);
    assert.equal(f.visibility(), visibility);
    assert.deepEqual(f.paths, []);
  }
});

test('YES publishes only the owned deck and preserves its existing share token', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(id, true), { status: 'ready', token });
  assert.equal(f.visibility(), 'public');
  assert.deepEqual(f.paths, ['/decks', '/deck-search']);
});

test('already public decks share without a visibility write', async () => {
  const f = fixture({ visibility: 'public' });
  assert.deepEqual(await f.run(id), { status: 'ready', token });
  assert.equal(f.calls.filter(c => c.update).length, 0);
});

test('invalid, unauthenticated and non-owned requests never create tokens or publish', async () => {
  for (const options of [{ authenticated: false }, { owned: false }]) {
    const f = fixture(options);
    assert.equal((await f.run(id, true)).status, 'error');
    assert.equal(f.calls.some(c => c.name || c.update), false);
  }
  const f = fixture();
  assert.equal((await f.run('invalid', true)).status, 'error');
  assert.equal(f.calls.length, 0);
});

test('token failure does not publish and publication failure never returns a copyable token', async () => {
  for (const options of [{ tokenError: true }, { publishError: true }]) {
    const f = fixture(options);
    assert.equal((await f.run(id, true)).status, 'error');
    assert.equal(f.visibility(), 'private');
    assert.deepEqual(f.paths, []);
  }
});
