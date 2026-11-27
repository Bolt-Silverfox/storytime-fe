type Needle = string | RegExp;

const matches = (text: string, needle: Needle): boolean => {
  if (typeof needle === 'string') {
    return text.includes(needle);
  }
  needle.lastIndex = 0;
  return needle.test(text);
};

const readOwn = (node: object, key: PropertyKey): unknown => {
  try {
    return Reflect.get(node, key);
  } catch {
    return undefined;
  }
};

export function fieldsMatching(value: unknown, needle: Needle): string[] {
  if (matches('', needle)) {
    throw new Error('fieldsMatching: the needle matches every string');
  }
  const hits: string[] = [];
  const seen = new WeakSet<object>();
  const visit = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      if (matches(node, needle)) {
        hits.push(path);
      }
      return;
    }
    if (
      typeof node === 'number' ||
      typeof node === 'bigint' ||
      typeof node === 'symbol'
    ) {
      visit(String(node), path);
      return;
    }
    if (!node || typeof node !== 'object' || seen.has(node)) {
      return;
    }
    seen.add(node);
    if (node instanceof Error) {
      for (const key of ['name', 'message', 'stack']) {
        visit(readOwn(node, key), `${path}.${key}`);
      }
    }
    if (node instanceof Map) {
      let index = 0;
      for (const [k, v] of node) {
        visit(k, `${path}<${index}:key>`);
        visit(v, `${path}<${index}>`);
        index++;
      }
    }
    if (node instanceof Set) {
      for (const v of node) {
        visit(v, `${path}<item>`);
      }
    }
    for (const key of Reflect.ownKeys(node)) {
      const label = `${path}.${String(key)}`;
      visit(key, `${label}<key>`);
      visit(readOwn(node, key), label);
    }
  };
  visit(value, '$');
  return hits;
}
