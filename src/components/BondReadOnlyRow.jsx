export default function BondReadOnlyRow({ bond, onEdit, onClone, onCalc, onToggleCashflows, isExpanded }) {
  const fmtDate = (d) => (typeof d === 'string' ? d.split('T')[0] : d) || '';
  return (
    <tr>
      <td>
        <button className="expand-toggle" onClick={onToggleCashflows} title="Toggle cashflows">
          {isExpanded ? '▼' : '▶'}
        </button>
      </td>
      <td><strong>{bond.ticker}</strong></td>
      <td>{fmtDate(bond.issue_date)}</td>
      <td>{fmtDate(bond.maturity)}</td>
      <td>{bond.coupon}</td>
      <td>{bond.index_code || '—'}</td>
      <td>{bond.offset_days}</td>
      <td>{bond.day_count_conv || '—'}</td>
      <td>
        <span className={`status-badge ${bond.active !== false ? 'active' : 'inactive'}`}>
          {bond.active !== false ? 'Yes' : 'No'}
        </span>
      </td>
      <td>
        <div className="table-action-group">
          <button className="btn btn-sm btn-secondary" onClick={onEdit}>Edit</button>
          <button className="btn btn-sm btn-success" onClick={onClone}>Clone</button>
          <button className="btn btn-sm btn-calc" onClick={onCalc}>Calc</button>
        </div>
      </td>
    </tr>
  );
}
