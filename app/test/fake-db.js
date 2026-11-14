// A tiny scripted stand-in for Postgres. Each call to query() consumes the next
// scripted response whose `match` regex fits the SQL. Lets the unit tests run
// in the pipeline without a database.
export function fakeDb(script = []) {
  const queue = [...script];
  const calls = [];
  const query = async (text, params) => {
    calls.push({ text, params });
    const idx = queue.findIndex((s) => s.match.test(text));
    if (idx === -1) return { rows: [], rowCount: 0 };
    const [step] = queue.splice(idx, 1);
    if (step.error) throw step.error;
    return { rows: step.rows ?? [], rowCount: step.rowCount ?? step.rows?.length ?? 0 };
  };
  return { query, tx: async (fn) => fn({ query }), calls };
}
