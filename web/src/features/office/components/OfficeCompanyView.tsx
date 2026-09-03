import Link from 'next/link';
import {
  breakdownOf,
  companyDeptsOf,
  OFFICE_UNASSIGNED_DEPT_LABEL,
  reviewLabelOf,
  rosterOf,
  workLabelOf,
  type CompanyDept,
  type OfficeDepartment,
  type OfficeEmployee,
} from '../lib/office';

export type OfficeCompanyViewProps = {
  /** 在籍・停止中を分けない全員 */
  employees: OfficeEmployee[];
  /**
   * 部署一覧（docs/specs/27-web-office-departments.md §2）。並びと見出しの表示名の出どころ。
   * 届いていなければ並びは返却順・見出しは id（同 §3.1-4・26 §3.4-2）。
   * **cerebellum 側に暫定の順序表・ラベル表を置かない**（27 §4）。
   */
  departments: OfficeDepartment[] | null | undefined;
};

/**
 * 社員1行（docs/specs/26-web-office-company.md §3.4-1）。出すのは4つだけ:
 * **名前・勤務帯 or 手動起動・仕事の一言（`profile.job`）・人間確認**。
 *
 * 成果物の行き先（`downstream`）は 21 §3.6 のミニラインに任せて入れない——
 * 行が伸びると1枚で一望できなくなる（同 §3.4-1）。
 * 行タップは社員カード（`/office?employee=`・§3.4-3）へ。ここでは操作させない（§7・20 §7）。
 */
function CompanyRow({ employee }: { employee: OfficeEmployee }) {
  const roster = rosterOf(employee);
  return (
    <li className="of__co-row">
      <Link
        className="of__co-member"
        href={`/office?employee=${encodeURIComponent(employee.automation_id)}`}
        aria-label={`${employee.name}の名簿を開く`}
      >
        <span className="of__co-name">{employee.name}</span>
        {/* 勤務帯 or 手動起動。`shift:null` を「手動」と読み替えない（21 §3.3-1） */}
        <span className="mono of__co-work">{workLabelOf(employee)}</span>
        {/* 欠損は欠損として出す（21 §3.2-3・26 §6）。skill 名から補わない */}
        <span className={'of__co-job' + (roster.missing ? ' of__co-job--missing' : '')}>
          {roster.missing ? '名簿 未記載' : roster.job}
        </span>
        {/* `null` は「人間確認: なし」＝正常な状態（26 §3.1-1）。未記載様式に寄せない */}
        <span className="mono of__co-review">{reviewLabelOf(roster.review)}</span>
      </Link>
    </li>
  );
}

function CompanyDeptSection({ dept }: { dept: CompanyDept }) {
  // 部署内は 勤務帯 → 手動起動 → 停止中（§3.4-4）。停止中だけ小見出しを立てる
  // ——勤務形態は各行が既に書いているので、ここで見出しを増やすと1枚が読みづらくなる
  const onDuty = [...dept.scheduled, ...dept.manual];
  /**
   * 見出しの主（docs/specs/27-web-office-departments.md §3.3-2 → §3.1-5）。
   * `departments` の label があればそれ、無ければ id をそのまま（同 §3.1-4）。
   * 全景タイル・部署ルームのヘッダと**同じ見出し形**に揃える。
   */
  const title = dept.label ?? dept.id ?? OFFICE_UNASSIGNED_DEPT_LABEL;
  // 添える id は label が届いた部署だけ（見出しが id の部署で同じ文字を2度書かない・§3.1-5）
  const subId = dept.label !== null && dept.id !== null ? dept.id : null;

  return (
    <section className="of__co-dept" aria-label={title}>
      {dept.id === null ? (
        // 行き先が無いのでリンクにしない（26 §3.1-3 と同じ扱い）。だが**隠さない**（§3.4-2）
        <p className="mono of__co-dept-name of__co-dept-name--missing">{title}</p>
      ) : (
        // タップ先は 26 §3.4-3 のまま `?dept=`（`?room=` の別名・27 §3.2-1）。
        // 表示名は `departments` から引くだけで、cerebellum に対応表を持たない（27 §4）
        <Link
          className={'of__co-dept-name' + (dept.label === null ? ' mono' : '')}
          href={`/office?dept=${encodeURIComponent(dept.id)}`}
          aria-label={`${title}の部署フロアへ`}
        >
          {title}
        </Link>
      )}
      {/* label が届いた部署だけ id を等幅で小さく添える（§3.1-5・全景タイルと同じ） */}
      {subId !== null && <p className="mono of__co-dept-id">{subId}</p>}
      <p className="mono of__co-breakdown">{breakdownOf(dept)}</p>

      {onDuty.length > 0 && (
        <ul className="of__co-list">
          {onDuty.map((employee) => (
            <CompanyRow key={employee.automation_id} employee={employee} />
          ))}
        </ul>
      )}

      {dept.stopped.length > 0 && (
        <>
          <p className="mono of__co-block">停止中</p>
          <ul className="of__co-list of__co-list--stopped">
            {dept.stopped.map((employee) => (
              <CompanyRow key={employee.automation_id} employee={employee} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * 会社案内（`/office?company=1`・docs/specs/26-web-office-company.md §3.4）。
 *
 * 「うちの会社に誰がいて、いつ働き、どこで自分の判断を求めてくるか」を1枚で読む面。
 * **テキストだけ・読むだけ**——席・部屋・書類の画像を使わず、SVG のノードグラフも持ち込まない
 * （§3.4-5）。流れの図はカード内のミニライン（21 §3.6）の担当で、ここは名簿の一覧。
 *
 * 鮮度警告（§3.4-7）は `OfficeView` が全画面共通の位置（先頭）で出すので、ここには持たない。
 */
export function OfficeCompanyView({ employees, departments }: OfficeCompanyViewProps) {
  // 並び・見出し・所属の判定は lib の1本に寄せる（全景と同じ規則・27 §3.3-1）
  const depts = companyDeptsOf(employees, departments);

  return (
    <>
      <header className="of3__room-header">
        <Link className="mono of3__back" href="/office">‹ OFFICE</Link>
        <div>
          <p className="mono of3__room-title">会社案内</p>
        </div>
      </header>

      <section className="of__co" aria-label="会社案内">
        {depts.length === 0 ? (
          <p className="of3__floor-empty">社員が居ません</p>
        ) : (
          depts.map((dept) => <CompanyDeptSection key={dept.id ?? '__unlisted'} dept={dept} />)
        )}
      </section>
    </>
  );
}
