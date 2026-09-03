import Link from 'next/link';
import {
  breakdownOf,
  companyDeptsOf,
  reviewLabelOf,
  rosterOf,
  workLabelOf,
  type CompanyDept,
  type OfficeEmployee,
} from '../lib/office';

export type OfficeCompanyViewProps = {
  /** 在籍・停止中を分けない全員。部署の並びは返却順で決まる（§3.4-2） */
  employees: OfficeEmployee[];
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
  const label = dept.id ?? '部署 未記載';

  return (
    <section className="of__co-dept" aria-label={label}>
      {dept.id === null ? (
        // 行き先が無いのでリンクにしない（26 §3.1-3 と同じ扱い）。だが**隠さない**（§3.4-2）
        <p className="mono of__co-dept-name of__co-dept-name--missing">部署 未記載</p>
      ) : (
        // 部署 id をそのまま出す（日本語ラベルの対応表を持たない・§3.3-2・§4）
        <Link
          className="mono of__co-dept-name"
          href={`/office?dept=${encodeURIComponent(dept.id)}`}
          aria-label={`${dept.id}の部署フロアへ`}
        >
          {dept.id}
        </Link>
      )}
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
export function OfficeCompanyView({ employees }: OfficeCompanyViewProps) {
  const depts = companyDeptsOf(employees);

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
