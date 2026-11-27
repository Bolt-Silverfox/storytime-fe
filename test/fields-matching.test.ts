import { describe, expect, it } from 'vitest';
import { fieldsMatching } from './fields-matching';

describe('fieldsMatching', () => {
  it('a global regex checks every field on every call', () => {
    const needle = /marker/g;
    const value = { marker: 'marker' };
    const both = ['$.marker<key>', '$.marker'];
    expect(fieldsMatching(value, needle)).toEqual(both);
    expect(fieldsMatching(['marker'], needle)).toEqual(['$.0']);
  });

  it('a sticky regex is tested from the start of each field', () => {
    expect(fieldsMatching({ marker: 'marker' }, /marker/y)).toEqual([
      '$.marker<key>',
      '$.marker',
    ]);
  });

  it.each([[''], [/(?:)/], [/x*/]])(
    'rejects a needle that matches every string: %s',
    (needle) => {
      expect(() => fieldsMatching({ a: 'b' }, needle)).toThrow();
    }
  );

  it('reads values behind getters', () => {
    const value = Object.defineProperty({}, 'secret', {
      get: () => 'marker',
      enumerable: false,
    });
    expect(fieldsMatching(value, 'marker')).toEqual(['$.secret']);
  });

  it('a throwing getter is skipped, not fatal', () => {
    const value = Object.defineProperty({ ok: 'marker' }, 'bad', {
      get: () => {
        throw new Error('trap');
      },
      enumerable: true,
    });
    expect(fieldsMatching(value, 'marker')).toEqual(['$.ok']);
  });

  it('a throwing Error field getter does not stop the other Error fields', () => {
    const error = new Error('marker in message');
    Object.defineProperty(error, 'name', {
      get: () => {
        throw new Error('trap');
      },
    });
    expect(fieldsMatching(error, 'marker')).toContain('$.message');
  });

  it('checks symbol keys and values held under them', () => {
    const value = { [Symbol('marker')]: 1, [Symbol('k')]: 'marker' };
    expect(fieldsMatching(value, 'marker')).toEqual([
      '$.Symbol(marker)<key>',
      '$.Symbol(k)',
    ]);
  });

  it('labels Map values by entry index and still checks keys', () => {
    const key = Object.create(null);
    const value = new Map<unknown, unknown>([
      [key, 'marker'],
      ['marker key', 1],
    ]);
    expect(fieldsMatching(value, 'marker')).toEqual(['$<0>', '$<1:key>']);
  });
});
