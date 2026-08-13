export type CalculationEntry = {
  expression: string;
  result: number;
};

export type CalculationScratch = {
  expression: string;
  history: CalculationEntry[];
};

export const EMPTY_CALCULATION: CalculationScratch = { expression: '', history: [] };

const DISPLAY_FORMAT = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 });

/** 式入力と再利用用。丸めず、JavaScript が保持する有限数をそのまま文字列化する。 */
export function calculationValue(value: number): string {
  return String(value);
}

/** 履歴表示用。長い循環小数だけを読みやすく抑える。 */
export function calculationDisplay(value: number): string {
  return DISPLAY_FORMAT.format(value);
}

/** JavaScript の Math.round と違い、負のちょうど半分も絶対値の大きい側へ丸める。 */
export function roundCalculation(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * 計算メモ専用の小さな再帰下降パーサー。
 * `eval` / `Function` は使わず、数値・四則演算・単項符号・括弧・% だけを受理する。
 */
export function evaluateCalculation(raw: string): number {
  const source = raw
    .normalize('NFKC')
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replace(/[−–—]/g, '-')
    .replaceAll(',', '')
    .replace(/\s+/g, '');

  if (source.length === 0) throw new Error('計算式を入力してください');
  if (source.length > 200) throw new Error('計算式は200文字以内で入力してください');

  let index = 0;

  const fail = (): never => {
    throw new Error('式を確認してください');
  };

  const parsePrimary = (): number => {
    let value: number;
    if (source[index] === '(') {
      index += 1;
      value = parseExpression();
      if (source[index] !== ')') fail();
      index += 1;
    } else {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(index));
      if (match === null) throw new Error('式を確認してください');
      index += match[0].length;
      value = Number(match[0]);
    }
    while (source[index] === '%') {
      value /= 100;
      index += 1;
    }
    return value;
  };

  const parseUnary = (): number => {
    if (source[index] === '+') {
      index += 1;
      return parseUnary();
    }
    if (source[index] === '-') {
      index += 1;
      return -parseUnary();
    }
    return parsePrimary();
  };

  const parseTerm = (): number => {
    let value = parseUnary();
    while (source[index] === '*' || source[index] === '/') {
      const operator = source[index];
      index += 1;
      const right = parseUnary();
      if (operator === '/' && right === 0) throw new Error('0では割れません');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };

  function parseExpression(): number {
    let value = parseTerm();
    while (source[index] === '+' || source[index] === '-') {
      const operator = source[index];
      index += 1;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = parseExpression();
  if (index !== source.length) fail();
  if (!Number.isFinite(result)) throw new Error('計算結果が大きすぎます');
  return result;
}
