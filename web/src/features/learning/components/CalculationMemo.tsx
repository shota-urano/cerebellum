'use client';

import { useRef, useState } from 'react';
import {
  calculationDisplay,
  calculationValue,
  evaluateCalculation,
  roundCalculation,
  type CalculationScratch,
} from '../lib/calculator';

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '%', '+', '(', ')'];

type CalculationMemoProps = {
  problemNo: number;
  scratch: CalculationScratch;
  onChange: (scratch: CalculationScratch) => void;
  onAnswer: (no: number, answer: string) => void;
};

/** number 問題だけに出す、問題ごとの計算履歴つきメモ電卓（docs/specs/15 §3.2）。 */
export function CalculationMemo({ problemNo, scratch, onChange, onAnswer }: CalculationMemoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const latest = scratch.history.at(-1);

  const setExpression = (expression: string) => {
    onChange({ ...scratch, expression });
    setError(null);
    setApplied(null);
  };

  const append = (token: string) => setExpression(scratch.expression + token);

  const calculate = () => {
    try {
      const result = evaluateCalculation(scratch.expression);
      onChange({ expression: '', history: [...scratch.history, { expression: scratch.expression, result }] });
      setError(null);
      setApplied(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '式を確認してください');
    }
  };

  const insertInExpression = (value: number) => {
    const expression = scratch.expression + calculationValue(value);
    setExpression(expression);
    // 履歴・ANSをタップしたあと、そのまま物理キーボードでも式の末尾から続けられるようにする
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(expression.length, expression.length);
    });
  };

  const applyAnswer = (value: number) => {
    const answer = calculationValue(value);
    onAnswer(problemNo, answer);
    setApplied(answer);
  };

  return (
    <div className="lx__calc">
      <button
        type="button"
        className="mono btn lx__calc-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? '計算メモを閉じる' : '計算メモを開く'}
        {scratch.history.length > 0 && <span className="lx__calc-count">{scratch.history.length}件</span>}
      </button>

      {open && (
        <div className="lx__calc-body">
          {scratch.history.length > 0 && (
            <ol className="lx__calc-history" aria-label={'問題' + problemNo + ' の計算履歴'}>
              {scratch.history.map((entry, index) => (
                <li className="lx__calc-entry" key={index}>
                  <span className="mono lx__calc-expression">{entry.expression}</span>
                  <button
                    type="button"
                    className="mono lx__calc-result"
                    aria-label={'計算' + (index + 1) + 'の結果 ' + calculationValue(entry.result) + ' を式に挿入'}
                    onClick={() => insertInExpression(entry.result)}
                  >
                    = {calculationDisplay(entry.result)}
                  </button>
                </li>
              ))}
            </ol>
          )}

          <label className="mono label" htmlFor={'lx-calc-' + problemNo}>計算式</label>
          <input
            id={'lx-calc-' + problemNo}
            ref={inputRef}
            type="text"
            className="mono input lx__calc-input"
            inputMode="text"
            maxLength={200}
            placeholder="例: 118000 + 35000 + 9000 / 3"
            aria-label={'問題' + problemNo + ' の計算式'}
            value={scratch.expression}
            onChange={(event) => setExpression(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                calculate();
              }
            }}
          />

          <div className="lx__calc-tools">
            <button type="button" className="mono btn lx__calc-tool" onClick={() => setExpression('')}>
              式をクリア
            </button>
            <button
              type="button"
              className="mono btn lx__calc-tool"
              disabled={!latest}
              onClick={() => latest && insertInExpression(latest.result)}
            >
              ANS
            </button>
            <button
              type="button"
              className="mono btn lx__calc-tool"
              aria-label="1文字消す"
              disabled={scratch.expression.length === 0}
              onClick={() => setExpression(scratch.expression.slice(0, -1))}
            >
              ⌫
            </button>
          </div>

          <div className="lx__calc-keys" aria-label={'問題' + problemNo + ' の計算キー'}>
            {KEYS.map((key) => (
              <button type="button" className="mono btn lx__calc-key" onClick={() => append(key)} key={key}>
                {key}
              </button>
            ))}
            <button type="button" className="mono btn btn--primary lx__calc-key lx__calc-equals" onClick={calculate}>
              =
            </button>
          </div>

          {error && <p className="mono form__error" role="alert">{error}</p>}

          {latest && (
            <div className="lx__calc-apply">
              <span className="mono label">最新結果を回答へ</span>
              <div className="lx__calc-rounding">
                <button type="button" className="mono btn" onClick={() => applyAnswer(latest.result)}>そのまま</button>
                <button type="button" className="mono btn" onClick={() => applyAnswer(Math.ceil(latest.result))}>切り上げ</button>
                <button type="button" className="mono btn" onClick={() => applyAnswer(Math.floor(latest.result))}>切り捨て</button>
                <button type="button" className="mono btn" onClick={() => applyAnswer(roundCalculation(latest.result))}>四捨五入</button>
              </div>
              {applied && <p className="mono lx__calc-applied" aria-live="polite">回答に {applied} を入力しました</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
